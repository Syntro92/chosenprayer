import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getPool, type Queryable } from "@/server/db";
import { claimDue, enqueueEmail, processOutbox } from "@/server/services/email";
import { channel, FakeSender } from "../helpers/fixtures";
import { withRollback } from "../helpers/rollback";

afterAll(async () => {
  await getPool().end();
});

const receipt = (over: Record<string, unknown> = {}) => ({
  donationId: randomUUID(),
  channelName: "Quiet Mornings",
  amountCents: 2500,
  currency: "USD",
  frequency: "once",
  paidAt: "2026-10-13T10:00:00Z",
  ...over,
});

/**
 * Other test files (and the running app) share this table, so every call below is scoped to the
 * ids this test created: it can neither see nor disturb anyone else's rows.
 */
const mine: string[] = [];
const add = async (c: Queryable, m: Parameters<typeof enqueueEmail>[1]): Promise<string> => {
  const id = await enqueueEmail(c, m);
  mine.push(id);
  return id;
};
async function fresh() {
  mine.length = 0;
}
const claim = (c: Queryable, n = 10) => claimDue(n, c, mine);
const run = (c: Queryable, sender: FakeSender, limit?: number) => processOutbox({ limit, ids: mine }, sender, c);
const row = async (c: Queryable, id: string) =>
  (await c.query("select status, attempts, send_after > now() as delayed, last_error, sent_at, locked_at from public.email_outbox where id = $1", [id])).rows[0];

describe("enqueueEmail / claimDue", () => {
  it("queues a pending email, due now", () =>
    withRollback(async (c) => {
      await fresh();
      const id = await add(c, { to: "A@Example.com", template: "donation_receipt", payload: receipt() });
      const r = (await c.query("select to_email::text as to_email, template, status, attempts, send_after <= now() as due, payload from public.email_outbox where id = $1", [id])).rows[0];
      expect(r).toMatchObject({ to_email: "A@Example.com", template: "donation_receipt", status: "pending", attempts: 0, due: true });
      expect(r.payload.channelName).toBe("Quiet Mornings");
    }));

  it("claims due rows exactly once and marks them as being sent", () =>
    withRollback(async (c) => {
      await fresh();
      const id = await add(c, { to: "a@example.com", template: "donation_receipt", payload: receipt() });
      const first = await claim(c, 10);
      expect(first.map((r) => r.id)).toEqual([id]);
      expect(first[0]).toMatchObject({ to_email: "a@example.com", attempts: 1 });
      expect(await row(c, id)).toMatchObject({ status: "sending", attempts: 1 });
      expect(await claim(c, 10)).toEqual([]); // already taken
    }));

  it("skips emails scheduled for later and respects the batch size", () =>
    withRollback(async (c) => {
      await fresh();
      await add(c, { to: "later@example.com", template: "donation_receipt", payload: receipt(), sendAfter: new Date(Date.now() + 3600_000) });
      for (let i = 0; i < 3; i++) await add(c, { to: `n${i}@example.com`, template: "donation_receipt", payload: receipt() });
      const batch = await claim(c, 2);
      expect(batch).toHaveLength(2);
      expect(batch.some((b) => b.to_email === "later@example.com")).toBe(false);
      expect(await claim(c, 10)).toHaveLength(1);
    }));

  it("re-claims an email whose worker died mid-send (stuck 10+ minutes), but not a recent one", () =>
    withRollback(async (c) => {
      await fresh();
      const stuck = await add(c, { to: "stuck@example.com", template: "donation_receipt", payload: receipt() });
      const recent = await add(c, { to: "recent@example.com", template: "donation_receipt", payload: receipt() });
      await c.query("update public.email_outbox set status = 'sending', attempts = 1, locked_at = now() - interval '11 minutes' where id = $1", [stuck]);
      await c.query("update public.email_outbox set status = 'sending', attempts = 1, locked_at = now() - interval '1 minute' where id = $1", [recent]);
      const got = await claim(c, 10);
      expect(got.map((g) => g.id)).toEqual([stuck]);
      expect(got[0].attempts).toBe(2);
    }));
});

describe("processOutbox", () => {
  it("renders and sends due emails, marks them sent, and stamps the donation's receipt time", () =>
    withRollback(async (c) => {
      await fresh();
      const ch = await channel(c);
      const { rows: [d] } = await c.query<{ id: string }>(
        "insert into public.donations (channel_id, amount_cents, currency, donor_email) values ($1, 2500, 'USD', 'who@example.com') returning id",
        [ch.id],
      );
      const id = await add(c, { to: "who@example.com", template: "donation_receipt", payload: receipt({ donationId: d.id }) });
      const sender = new FakeSender();

      const result = await run(c, sender);
      expect(result).toEqual({ claimed: 1, sent: 1, retrying: 0, failed: 0 });
      expect(sender.sent).toHaveLength(1);
      expect(sender.sent[0]).toMatchObject({ to: "who@example.com", subject: "Thank you for supporting Quiet Mornings" });
      expect(sender.sent[0].text).toContain("$25");
      expect(await row(c, id)).toMatchObject({ status: "sent", last_error: null, locked_at: null });
      expect((await c.query("select receipt_sent_at from public.donations where id = $1", [d.id])).rows[0].receipt_sent_at).not.toBeNull();
      expect((await run(c, sender)).claimed).toBe(0); // nothing left
    }));

  it("a failed send is retried later with growing delays", () =>
    withRollback(async (c) => {
      await fresh();
      const id = await add(c, { to: "flaky@example.com", template: "donation_receipt", payload: receipt() });
      const sender = new FakeSender();
      sender.failWith = new Error("SMTP timeout");

      expect(await run(c, sender)).toEqual({ claimed: 1, sent: 0, retrying: 1, failed: 0 });
      const r = await row(c, id);
      expect(r).toMatchObject({ status: "pending", attempts: 1, delayed: true, last_error: "SMTP timeout", locked_at: null });
      // not due again yet
      expect((await run(c, sender)).claimed).toBe(0);
      // once due, a healthy sender succeeds
      await c.query("update public.email_outbox set send_after = now() where id = $1", [id]);
      sender.failWith = null;
      expect(await run(c, sender)).toMatchObject({ sent: 1 });
      expect(await row(c, id)).toMatchObject({ status: "sent", attempts: 2 });
    }));

  it("gives up after 5 attempts and marks the email failed", () =>
    withRollback(async (c) => {
      await fresh();
      const id = await add(c, { to: "dead@example.com", template: "donation_receipt", payload: receipt() });
      await c.query("update public.email_outbox set attempts = 4 where id = $1", [id]);
      const sender = new FakeSender();
      sender.failWith = new Error("mailbox does not exist");
      expect(await run(c, sender)).toEqual({ claimed: 1, sent: 0, retrying: 0, failed: 1 });
      expect(await row(c, id)).toMatchObject({ status: "failed", attempts: 5, last_error: "mailbox does not exist" });
      expect((await run(c, sender)).claimed).toBe(0);
    }));

  it("an email with an unknown template fails cleanly instead of crashing the batch", () =>
    withRollback(async (c) => {
      await fresh();
      const bad = await add(c, { to: "bad@example.com", template: "nope" as never, payload: {} });
      const good = await add(c, { to: "good@example.com", template: "donation_refunded", payload: { channelName: "X", amountCents: 500, currency: "USD" } });
      const sender = new FakeSender();
      const result = await run(c, sender);
      expect(result).toMatchObject({ claimed: 2, sent: 1, retrying: 1 });
      expect((await row(c, bad)).last_error).toMatch(/Unknown email template/);
      expect((await row(c, good)).status).toBe("sent");
    }));

  it("honours the limit", () =>
    withRollback(async (c) => {
      await fresh();
      for (let i = 0; i < 4; i++) await add(c, { to: `l${i}@example.com`, template: "donation_refunded", payload: { channelName: "X", amountCents: 100, currency: "USD" } });
      expect((await run(c, new FakeSender(), 3)).sent).toBe(3);
      expect((await run(c, new FakeSender(), 3)).sent).toBe(1);
    }));
});
