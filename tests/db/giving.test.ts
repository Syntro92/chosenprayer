import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getPool, type Queryable } from "@/server/db";
import { getEnv } from "@/server/env";
import type { PaymentEvent } from "@/server/providers/payments";
import { createBlessing } from "@/server/services/blessings";
import {
  adminRefund,
  cancelMySubscription,
  getDonationStatus,
  getGivingConfig,
  handlePaymentEvent,
  listMyDonations,
  listMySubscriptions,
  simulateMockPayment,
  startDonation,
  sweepStaleDonations,
} from "@/server/services/giving";
import { getChannelProfile } from "@/server/services/channels";
import { listNotifications } from "@/server/services/notifications";
import { channel, FakeProvider, member, saturate } from "../helpers/fixtures";
import { withRollback } from "../helpers/rollback";

afterAll(async () => {
  await getPool().end();
});

const ctx = () => ({ ip: `test-${randomUUID()}` });
type Actor = Awaited<ReturnType<typeof member>> | null;

const start = (c: Queryable, actor: Actor, ch: { handle: string }, over: Record<string, unknown> = {}, prov = new FakeProvider()) =>
  startDonation(actor, { channelHandle: ch.handle, amount: 25, frequency: "once", donorEmail: "Guest@Example.com", idempotencyKey: randomUUID(), ...over }, ctx(), c, prov);

const pidOf = async (c: Queryable, donationId: string) =>
  (await c.query<{ p: string }>("select provider_payment_id p from public.donations where id = $1", [donationId])).rows[0].p;
const subOf = async (c: Queryable, donationId: string) =>
  (await c.query<{ p: string }>("select provider_subscription_id p from public.donations where id = $1", [donationId])).rows[0].p;

const succeed = (pid: string, over: Partial<PaymentEvent> = {}): PaymentEvent =>
  ({ type: "payment.succeeded", eventId: randomUUID(), providerPaymentId: pid, feeCents: 100, ...over }) as PaymentEvent;
const handle = (c: Queryable, e: PaymentEvent) => handlePaymentEvent(e, "mock", c);

/** Starts a donation and completes it, returning everything a test needs. */
async function paid(c: Queryable, actor: Actor, ch: { handle: string }, over: Record<string, unknown> = {}, prov = new FakeProvider()) {
  const s = await start(c, actor, ch, over, prov);
  const pid = await pidOf(c, s.donationId);
  await handle(c, succeed(pid));
  return { ...s, pid };
}
const outbox = async (c: Queryable, to?: string) =>
  (await c.query("select to_email::text as to_email, template, payload from public.email_outbox where ($1::text is null or to_email = $1::citext) order by created_at", [to ?? null])).rows;

/* ======================================================================== */
describe("getGivingConfig", () => {
  it("reports test mode and the limits", async () => {
    expect(await getGivingConfig()).toMatchObject({ provider: "mock", available: true, recurring: true, minAmount: 5, maxAmount: 999_999 });
  });
});

describe("startDonation", () => {
  it("creates a PENDING guest donation with the provider's checkout and a secret token", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const prov = new FakeProvider();
      const r = await start(c, null, ch, { amount: 25, donorName: "  Sarah  " }, prov);
      expect(r).toMatchObject({ status: "pending", amountCents: 2500, currency: "USD", frequency: "once", provider: "mock" });
      expect(r.token).toMatch(/^[0-9a-f]{48}$/);
      expect(r.clientSecret).toMatch(/^secret_/);

      const d = (await c.query("select status, donor_id, donor_name, donor_email::text as email, amount_cents, provider_payment_id from public.donations where id = $1", [r.donationId])).rows[0];
      expect(d).toMatchObject({ status: "pending", donor_id: null, donor_name: "Sarah", email: "guest@example.com", amount_cents: 2500 });
      expect(d.provider_payment_id).toMatch(/^pi_/);
      expect(prov.checkouts[0]).toMatchObject({ amountCents: 2500, currency: "USD", frequency: "once", donorEmail: "guest@example.com" });
      // nothing is counted until the provider confirms
      const stats = (await c.query("select total_raised_cents, supporter_count from public.channels where id = $1", [ch.id])).rows[0];
      expect(stats).toMatchObject({ total_raised_cents: 0, supporter_count: 0 });
    }));

  it("uses the signed-in member's name and account email", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const me = await member(c, { name: "Kasun Fernando" });
      const r = await start(c, me, ch, { donorEmail: "ignored@example.com", donorName: "Ignored" });
      const d = (await c.query("select donor_id, donor_name, donor_email::text as email from public.donations where id = $1", [r.donationId])).rows[0];
      const accountEmail = (await c.query("select email from auth.users where id = $1", [me.userId])).rows[0].email;
      expect(d).toMatchObject({ donor_id: me.userId, donor_name: "Kasun Fernando", email: accountEmail });
    }));

  it("starts a monthly gift with a provider subscription reference", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const r = await start(c, null, ch, { frequency: "monthly" });
      expect(r.frequency).toBe("monthly");
      expect(await subOf(c, r.donationId)).toMatch(/^sub_/);
    }));

  it("validates the amount, frequency, email and channel", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const bad = (over: Record<string, unknown>) => start(c, null, ch, over);
      for (const amount of [0, -5, 1000000, 2.5, "abc"]) await expect(bad({ amount })).rejects.toMatchObject({ name: "ZodError" });
      await expect(bad({ donorEmail: undefined })).rejects.toMatchObject({ code: "VALIDATION", fields: { donorEmail: expect.any(String) } });
      await expect(bad({ donorEmail: "not-an-email" })).rejects.toMatchObject({ name: "ZodError" });
      await expect(bad({ frequency: "weekly" })).rejects.toMatchObject({ name: "ZodError" });
      await expect(bad({ idempotencyKey: "short" })).rejects.toMatchObject({ name: "ZodError" });
      await expect(start(c, null, { handle: "no_such_channel_zz" })).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect((await start(c, null, ch, { amount: 999999 })).amountCents).toBe(99_999_900);
      expect((await start(c, null, ch, { amount: 5 })).amountCents).toBe(500);
    }));

  it("only works for active channels", () =>
    withRollback(async (c) => {
      for (const status of ["paused", "pending", "archived"]) {
        const ch = await channel(c, { status });
        await expect(start(c, null, ch)).rejects.toMatchObject({ code: "NOT_FOUND" });
      }
    }));

  it("blocks suspended members and rate-limits per person", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const banned = await member(c, { status: "suspended" });
      await expect(start(c, banned, ch)).rejects.toMatchObject({ code: "FORBIDDEN" });
      const me = await member(c);
      await saturate(c, "donation", me.userId);
      await expect(start(c, me, ch)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    }));

  describe("idempotency", () => {
    it("the same key returns the same donation and never creates a second checkout", () =>
      withRollback(async (c) => {
        const ch = await channel(c);
        const prov = new FakeProvider();
        const key = randomUUID();
        const a = await start(c, null, ch, { idempotencyKey: key }, prov);
        const b = await start(c, null, ch, { idempotencyKey: key }, prov);
        expect(b.donationId).toBe(a.donationId);
        expect(b.token).toBe(a.token);
        expect(prov.checkouts).toHaveLength(1);
        expect(prov.resumed).toHaveLength(1);
        expect(b.clientSecret).toMatch(/^resumed_/);
        expect((await c.query("select count(*)::int n from public.donations where idempotency_key = $1", [key])).rows[0].n).toBe(1);
      }));

    it("a settled donation resumes without a payment secret", () =>
      withRollback(async (c) => {
        const ch = await channel(c);
        const key = randomUUID();
        await paid(c, null, ch, { idempotencyKey: key });
        const again = await start(c, null, ch, { idempotencyKey: key });
        expect(again).toMatchObject({ status: "succeeded", clientSecret: null });
      }));

    it("the key can't be reused for a different gift or by a different person", () =>
      withRollback(async (c) => {
        const ch = await channel(c);
        const other = await channel(c);
        const me = await member(c);
        const key = randomUUID();
        await start(c, null, ch, { idempotencyKey: key, amount: 25 });
        await expect(start(c, null, ch, { idempotencyKey: key, amount: 50 })).rejects.toMatchObject({ code: "CONFLICT" });
        await expect(start(c, null, other, { idempotencyKey: key, amount: 25 })).rejects.toMatchObject({ code: "CONFLICT" });
        await expect(start(c, null, ch, { idempotencyKey: key, amount: 25, frequency: "monthly" })).rejects.toMatchObject({ code: "CONFLICT" });
        await expect(start(c, me, ch, { idempotencyKey: key, amount: 25 })).rejects.toMatchObject({ code: "CONFLICT" });
      }));
  });
});

/* ======================================================================== */
describe("handlePaymentEvent: one-time gifts", () => {
  it("success: marks paid, updates the channel, queues a receipt, tells the owner, logs the event", () =>
    withRollback(async (c) => {
      const owner = await member(c, { name: "Owner" });
      const ch = await channel(c, { ownerId: owner.userId, name: "Quiet Mornings" });
      const s = await start(c, null, ch, { amount: 25, donorEmail: "sarah@example.com" });
      const pid = await pidOf(c, s.donationId);
      const e = succeed(pid, { feeCents: 103 });

      const out = await handle(c, e);
      expect(out).toMatchObject({ duplicate: false, ignored: false, channelHandles: [ch.handle] });

      const d = (await c.query("select status, fee_cents, paid_at from public.donations where id = $1", [s.donationId])).rows[0];
      expect(d).toMatchObject({ status: "succeeded", fee_cents: 103 });
      expect(d.paid_at).not.toBeNull();
      const stats = (await c.query("select total_raised_cents, supporter_count from public.channels where id = $1", [ch.id])).rows[0];
      expect(stats).toMatchObject({ total_raised_cents: 2500, supporter_count: 1 });

      const mail = await outbox(c, "sarah@example.com");
      expect(mail).toHaveLength(1);
      expect(mail[0]).toMatchObject({ template: "donation_receipt" });
      expect(mail[0].payload).toMatchObject({ donationId: s.donationId, channelName: "Quiet Mornings", amountCents: 2500, currency: "USD", frequency: "once" });

      expect((await listNotifications(owner, {}, c)).items.map((n) => n.text)).toEqual(["A supporter gave $25 to Quiet Mornings"]);
      const logged = (await c.query("select type, processed_at from public.payment_events where event_id = $1", [(e as { eventId: string }).eventId])).rows[0];
      expect(logged.type).toBe("payment.succeeded");
      expect(logged.processed_at).not.toBeNull();
    }));

  it("is idempotent: replaying the same event (providers retry) changes nothing", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const s = await start(c, null, ch, { donorEmail: "once@example.com" });
      const e = succeed(await pidOf(c, s.donationId));
      await handle(c, e);
      const again = await handle(c, e);
      expect(again).toMatchObject({ duplicate: true, channelHandles: [] });
      expect(await outbox(c, "once@example.com")).toHaveLength(1);
      expect((await c.query("select total_raised_cents from public.channels where id = $1", [ch.id])).rows[0].total_raised_cents).toBe(2500);
    }));

  it("a second 'succeeded' event with a different id for the same payment does not double-send", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const s = await start(c, null, ch, { donorEmail: "twice@example.com" });
      const pid = await pidOf(c, s.donationId);
      await handle(c, succeed(pid));
      await handle(c, succeed(pid));
      expect(await outbox(c, "twice@example.com")).toHaveLength(1);
    }));

  it("failure, then a successful retry", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const s = await start(c, null, ch);
      const pid = await pidOf(c, s.donationId);
      await handle(c, { type: "payment.failed", eventId: randomUUID(), providerPaymentId: pid, reason: "Card declined" });
      expect((await c.query("select status, failure_reason from public.donations where id = $1", [s.donationId])).rows[0]).toMatchObject({ status: "failed", failure_reason: "Card declined" });
      await handle(c, succeed(pid));
      expect((await c.query("select status, failure_reason from public.donations where id = $1", [s.donationId])).rows[0]).toMatchObject({ status: "succeeded", failure_reason: null });
    }));

  it("out-of-order events can't undo a settled or refunded donation", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const { donationId, pid } = await paid(c, null, ch);
      await handle(c, { type: "payment.failed", eventId: randomUUID(), providerPaymentId: pid, reason: "late failure" });
      expect((await c.query("select status from public.donations where id = $1", [donationId])).rows[0].status).toBe("succeeded");

      await handle(c, { type: "payment.refunded", eventId: randomUUID(), providerPaymentId: pid });
      await handle(c, succeed(pid)); // a stale "succeeded" arriving after the refund
      expect((await c.query("select status from public.donations where id = $1", [donationId])).rows[0].status).toBe("refunded");
    }));

  it("refund: status, channel totals and the donor email all follow", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const { donationId, pid } = await paid(c, null, ch, { donorEmail: "refund@example.com" });
      const out = await handle(c, { type: "payment.refunded", eventId: randomUUID(), providerPaymentId: pid });
      expect(out.channelHandles).toEqual([ch.handle]);
      expect((await c.query("select status, refunded_at from public.donations where id = $1", [donationId])).rows[0].status).toBe("refunded");
      expect((await c.query("select total_raised_cents, supporter_count from public.channels where id = $1", [ch.id])).rows[0]).toMatchObject({ total_raised_cents: 0, supporter_count: 0 });
      expect((await outbox(c, "refund@example.com")).map((m) => m.template)).toEqual(["donation_receipt", "donation_refunded"]);
    }));

  it("an event for an unknown payment is ignored, not an error", () =>
    withRollback(async (c) => {
      const out = await handle(c, succeed("pi_does_not_exist"));
      expect(out).toMatchObject({ duplicate: false, ignored: true, channelHandles: [] });
      expect((await handle(c, { type: "payment.failed", eventId: randomUUID(), providerPaymentId: "nope", reason: "x" })).ignored).toBe(true);
      expect((await handle(c, { type: "payment.refunded", eventId: randomUUID(), providerPaymentId: "nope" })).ignored).toBe(true);
    }));

  it("an owner is not notified about their own gift, and an unowned channel notifies nobody", () =>
    withRollback(async (c) => {
      const owner = await member(c);
      const own = await channel(c, { ownerId: owner.userId });
      await paid(c, owner, own);
      expect((await listNotifications(owner, {}, c)).items).toEqual([]);
      await paid(c, null, await channel(c, { ownerId: null }));
    }));
});

describe("handlePaymentEvent: owner notification setting", () => {
  it("is silenced by Settings > notify on donation = off (the receipt still goes out)", () =>
    withRollback(async (c) => {
      const owner = await member(c);
      const ch = await channel(c, { ownerId: owner.userId });
      await c.query("update public.site_settings set notify_on_donation = false where id");
      const s = await start(c, null, ch, { amount: 25, donorEmail: "quiet2@example.com" });
      await handle(c, succeed(await pidOf(c, s.donationId)));
      expect((await listNotifications(owner, {}, c)).items).toEqual([]);
      expect(await outbox(c, "quiet2@example.com")).toHaveLength(1);
    }));
});

describe("handlePaymentEvent: monthly gifts", () => {
  it("first payment creates the subscription and links the donation", () =>
    withRollback(async (c) => {
      const me = await member(c);
      const ch = await channel(c);
      const { donationId } = await paid(c, me, ch, { frequency: "monthly", amount: 11 });
      const sub = (await c.query("select s.status, s.amount_cents, s.donor_id, s.current_period_end > now() + interval '27 days' as period_ok, d.subscription_id = s.id as linked from public.subscriptions s join public.donations d on d.subscription_id = s.id where d.id = $1", [donationId])).rows[0];
      expect(sub).toMatchObject({ status: "active", amount_cents: 1100, donor_id: me.userId, period_ok: true, linked: true });
      expect((await listMySubscriptions(me, c))[0]).toMatchObject({ status: "active", amountCents: 1100, channel: { handle: ch.handle } });
    }));

  it("each later cycle becomes its own donation, exactly once", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const { donationId } = await paid(c, null, ch, { frequency: "monthly", amount: 10, donorEmail: "monthly@example.com" });
      const subRef = await subOf(c, donationId);
      const renew = (payId: string, eventId = randomUUID()): PaymentEvent => ({
        type: "subscription.renewed", eventId, providerSubscriptionId: subRef, providerPaymentId: payId, amountCents: 1000, currency: "USD", feeCents: 59,
      });
      const first = renew("pi_cycle_2");
      expect((await handle(c, first)).channelHandles).toEqual([ch.handle]);
      await handle(c, first); // same event again
      await handle(c, renew("pi_cycle_2")); // same payment, new event id
      expect((await c.query("select count(*)::int n from public.donations where subscription_id is not null and status = 'succeeded'")).rows[0].n).toBeGreaterThanOrEqual(2);
      const cycles = (await c.query("select count(*)::int n from public.donations where provider_subscription_id = $1 and status = 'succeeded'", [subRef])).rows[0].n;
      expect(cycles).toBe(2);
      expect((await c.query("select total_raised_cents from public.channels where id = $1", [ch.id])).rows[0].total_raised_cents).toBe(2000);
      expect((await outbox(c, "monthly@example.com")).filter((m) => m.template === "donation_receipt")).toHaveLength(2);
    }));

  it("past_due, then canceled (with an email), and later cycles are ignored", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const { donationId } = await paid(c, null, ch, { frequency: "monthly", donorEmail: "cancel@example.com" });
      const subRef = await subOf(c, donationId);
      const status = async () => (await c.query("select status from public.subscriptions where provider_subscription_id = $1", [subRef])).rows[0].status;

      await handle(c, { type: "subscription.past_due", eventId: randomUUID(), providerSubscriptionId: subRef });
      expect(await status()).toBe("past_due");
      await handle(c, { type: "subscription.canceled", eventId: randomUUID(), providerSubscriptionId: subRef });
      expect(await status()).toBe("canceled");
      expect((await outbox(c, "cancel@example.com")).map((m) => m.template)).toContain("subscription_canceled");

      const late = await handle(c, { type: "subscription.renewed", eventId: randomUUID(), providerSubscriptionId: subRef, providerPaymentId: "pi_late", amountCents: 2500, currency: "USD" });
      expect(late.ignored).toBe(true);
      expect((await c.query("select count(*)::int n from public.donations where provider_payment_id = 'pi_late'")).rows[0].n).toBe(0);
    }));

  it("ignores events for unknown subscriptions and for channels that are no longer active", () =>
    withRollback(async (c) => {
      expect((await handle(c, { type: "subscription.renewed", eventId: randomUUID(), providerSubscriptionId: "sub_unknown", providerPaymentId: "pi_x", amountCents: 100, currency: "USD" })).ignored).toBe(true);
      expect((await handle(c, { type: "subscription.past_due", eventId: randomUUID(), providerSubscriptionId: "sub_unknown" })).ignored).toBe(true);
      expect((await handle(c, { type: "subscription.canceled", eventId: randomUUID(), providerSubscriptionId: "sub_unknown" })).ignored).toBe(true);

      const ch = await channel(c);
      const { donationId } = await paid(c, null, ch, { frequency: "monthly" });
      await c.query("update public.channels set status = 'paused' where id = $1", [ch.id]);
      const out = await handle(c, { type: "subscription.renewed", eventId: randomUUID(), providerSubscriptionId: await subOf(c, donationId), providerPaymentId: "pi_paused", amountCents: 2500, currency: "USD" });
      expect(out.ignored).toBe(true);
    }));
});

/* ======================================================================== */
describe("getDonationStatus", () => {
  it("is readable with the secret token, by the donor, and by an admin, and nobody else", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const me = await member(c);
      const stranger = await member(c);
      const admin = await member(c, { role: "admin" });
      const guest = await start(c, null, ch);
      const mine = await start(c, me, ch);

      expect(await getDonationStatus(null, { donationId: guest.donationId, token: guest.token }, c)).toMatchObject({
        status: "pending", amountCents: 2500, canLeaveBlessing: false, channel: { handle: ch.handle },
      });
      expect((await getDonationStatus(me, { donationId: mine.donationId }, c)).id).toBe(mine.donationId);
      expect((await getDonationStatus(admin, { donationId: guest.donationId }, c)).id).toBe(guest.donationId);

      for (const attempt of [
        () => getDonationStatus(null, { donationId: guest.donationId }, c),
        () => getDonationStatus(null, { donationId: guest.donationId, token: "wrong-token-wrong-token" }, c),
        () => getDonationStatus(stranger, { donationId: mine.donationId }, c),
        () => getDonationStatus(me, { donationId: guest.donationId }, c),
        () => getDonationStatus(null, { donationId: randomUUID(), token: guest.token }, c),
      ]) {
        await expect(attempt()).rejects.toMatchObject({ code: "NOT_FOUND" });
      }
      await expect(getDonationStatus(null, { donationId: "nope", token: guest.token }, c)).rejects.toMatchObject({ name: "ZodError" });
    }));

  it("offers a blessing once the gift is confirmed, until one is left", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const g = await paid(c, null, ch);
      const ask = () => getDonationStatus(null, { donationId: g.donationId, token: g.token }, c);
      expect(await ask()).toMatchObject({ status: "succeeded", canLeaveBlessing: true, hasBlessing: false });
      await createBlessing(null, { donationId: g.donationId, token: g.token, message: "Thank you" }, c);
      expect(await ask()).toMatchObject({ canLeaveBlessing: false, hasBlessing: true });
    }));
});

describe("simulateMockPayment (test mode)", () => {
  const play = (c: Queryable, g: { donationId: string; token: string }, outcome: string, actor: Actor = null) =>
    simulateMockPayment(actor, { donationId: g.donationId, token: g.token, outcome }, c);

  it("drives a donation through the real handler", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const g = await start(c, null, ch);
      expect(await play(c, g, "succeeded")).toMatchObject({ status: "succeeded", duplicate: false, channelHandles: [ch.handle] });
      expect(await play(c, g, "refunded")).toMatchObject({ status: "refunded" });
      const g2 = await start(c, null, ch);
      expect((await play(c, g2, "failed")).status).toBe("failed");
    }));

  it("monthly outcomes: renew, past_due, cancel_subscription", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const g = await start(c, null, ch, { frequency: "monthly" });
      await play(c, g, "succeeded");
      await play(c, g, "renew");
      expect((await c.query("select count(*)::int n from public.donations where provider_subscription_id = $1", [await subOf(c, g.donationId)])).rows[0].n).toBe(2);
      await play(c, g, "past_due");
      await play(c, g, "cancel_subscription");
      expect((await c.query("select status from public.subscriptions limit 1")).rows[0].status).toBeDefined();
      const once = await start(c, null, ch);
      await expect(play(c, once, "renew")).rejects.toMatchObject({ code: "VALIDATION" });
    }));

  it("can't be used on someone else's donation, with a bad outcome, or outside test mode", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const g = await start(c, null, ch);
      await expect(simulateMockPayment(null, { donationId: g.donationId, outcome: "succeeded" }, c)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(simulateMockPayment(await member(c), { donationId: g.donationId, outcome: "succeeded" }, c)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(play(c, g, "teleport")).rejects.toMatchObject({ name: "ZodError" });

      const env = getEnv();
      const saved = env.NODE_ENV;
      try {
        (env as { NODE_ENV: string }).NODE_ENV = "production";
        await expect(play(c, g, "succeeded")).rejects.toMatchObject({ code: "NOT_FOUND" });
      } finally {
        (env as { NODE_ENV: string }).NODE_ENV = saved;
      }
      expect((await c.query("select status from public.donations where id = $1", [g.donationId])).rows[0].status).toBe("pending");
    }));
});

/* ======================================================================== */
describe("listMyDonations / listMySubscriptions", () => {
  it("lists my completed gifts newest first and nothing else", () =>
    withRollback(async (c) => {
      const me = await member(c);
      const other = await member(c);
      const ch = await channel(c, { name: "Mine Channel" });
      const a = await paid(c, me, ch, { amount: 10 });
      const b = await paid(c, me, ch, { amount: 20 });
      await start(c, me, ch); // pending: not listed
      await paid(c, other, ch);
      await c.query("update public.donations set created_at = now() - interval '2 days' where id = $1", [a.donationId]);

      const page = await listMyDonations(me, {}, c);
      expect(page.items.map((i) => i.id)).toEqual([b.donationId, a.donationId]);
      expect(page.items[0]).toMatchObject({ status: "succeeded", amountCents: 2000, channel: { handle: ch.handle, name: "Mine Channel" } });
      const p1 = await listMyDonations(me, { limit: 1 }, c);
      expect(p1.nextCursor).not.toBeNull();
      expect((await listMyDonations(me, { limit: 1, cursor: p1.nextCursor! }, c)).items.map((i) => i.id)).toEqual([a.donationId]);
      await expect(listMyDonations(me, { cursor: "bogus" }, c)).rejects.toMatchObject({ code: "VALIDATION" });
      await expect(listMyDonations(null, {}, c)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    }));
});

describe("cancelMySubscription", () => {
  async function monthly(c: Queryable, me: NonNullable<Actor>, prov = new FakeProvider()) {
    const ch = await channel(c);
    const g = await paid(c, me, ch, { frequency: "monthly" }, prov);
    const sub = (await listMySubscriptions(me, c))[0];
    return { g, sub, prov };
  }

  it("stops the subscription at the provider and in the database, and tells the donor", () =>
    withRollback(async (c) => {
      const me = await member(c);
      const { sub, prov, g } = await monthly(c, me);
      await cancelMySubscription(me, sub.id, c, prov);
      expect(prov.canceled).toEqual([await subOf(c, g.donationId)]);
      expect((await c.query("select status, canceled_at from public.subscriptions where id = $1", [sub.id])).rows[0].status).toBe("canceled");
      expect((await outbox(c)).some((m) => m.template === "subscription_canceled")).toBe(true);
    }));

  it("is idempotent and strictly the donor's own", () =>
    withRollback(async (c) => {
      const me = await member(c);
      const stranger = await member(c);
      const { sub, prov } = await monthly(c, me);
      await cancelMySubscription(me, sub.id, c, prov);
      await cancelMySubscription(me, sub.id, c, prov);
      expect(prov.canceled).toHaveLength(1);
      await expect(cancelMySubscription(stranger, sub.id, c, prov)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(cancelMySubscription(me, randomUUID(), c, prov)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(cancelMySubscription(me, "nope", c, prov)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(cancelMySubscription(null, sub.id, c, prov)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    }));
});

describe("adminRefund", () => {
  it("refunds at the provider, updates everything, emails the donor and audits", () =>
    withRollback(async (c) => {
      const admin = await member(c, { role: "admin" });
      const ch = await channel(c);
      const prov = new FakeProvider();
      const g = await paid(c, null, ch, { donorEmail: "refunded@example.com" }, prov);

      expect(await adminRefund(admin, g.donationId, { reason: "  Duplicate gift " }, c, prov)).toEqual({ channelHandle: ch.handle });
      expect(prov.refunded).toEqual([g.pid]);
      expect((await c.query("select status from public.donations where id = $1", [g.donationId])).rows[0].status).toBe("refunded");
      expect((await c.query("select total_raised_cents from public.channels where id = $1", [ch.id])).rows[0].total_raised_cents).toBe(0);
      expect((await outbox(c, "refunded@example.com")).map((m) => m.template)).toContain("donation_refunded");
      const log = (await c.query("select action, metadata from public.audit_log where entity_id = $1", [g.donationId])).rows;
      expect(log[0]).toMatchObject({ action: "donation.refund" });
      expect(log[0].metadata).toMatchObject({ reason: "Duplicate gift", amountCents: 2500, channel: ch.handle });
    }));

  it("is admin-only, needs a reason, and only works once on completed gifts", () =>
    withRollback(async (c) => {
      const admin = await member(c, { role: "admin" });
      const ch = await channel(c);
      const prov = new FakeProvider();
      const done = await paid(c, null, ch, {}, prov);
      const pending = await start(c, null, ch, {}, prov);

      await expect(adminRefund(await member(c), done.donationId, { reason: "x" }, c, prov)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(adminRefund(null, done.donationId, { reason: "x" }, c, prov)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      await expect(adminRefund(admin, done.donationId, { reason: "" }, c, prov)).rejects.toMatchObject({ name: "ZodError" });
      await expect(adminRefund(admin, pending.donationId, { reason: "x" }, c, prov)).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(adminRefund(admin, randomUUID(), { reason: "x" }, c, prov)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await adminRefund(admin, done.donationId, { reason: "x" }, c, prov);
      await expect(adminRefund(admin, done.donationId, { reason: "x" }, c, prov)).rejects.toMatchObject({ code: "CONFLICT" });
      expect(prov.refunded).toHaveLength(1);
    }));
});

describe("sweepStaleDonations", () => {
  it("closes abandoned checkouts older than a day and nothing else", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const stale = await start(c, null, ch);
      const fresh = await start(c, null, ch);
      const settled = await paid(c, null, ch);
      await c.query("update public.donations set created_at = now() - interval '25 hours' where id = any($1)", [[stale.donationId, settled.donationId]]);
      expect(await sweepStaleDonations(c)).toBeGreaterThanOrEqual(1);
      const st = async (id: string) => (await c.query("select status from public.donations where id = $1", [id])).rows[0].status;
      expect(await st(stale.donationId)).toBe("canceled");
      expect(await st(fresh.donationId)).toBe("pending");
      expect(await st(settled.donationId)).toBe("succeeded");
    }));

  it("a late success still settles a canceled checkout (the money is real)", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const g = await start(c, null, ch);
      await c.query("update public.donations set status = 'canceled' where id = $1", [g.donationId]);
      await handle(c, succeed(await pidOf(c, g.donationId)));
      expect((await c.query("select status from public.donations where id = $1", [g.donationId])).rows[0].status).toBe("succeeded");
    }));
});

/* ======================================================================== */
describe("blessings", () => {
  it("a guest can leave one with their token; name and amount follow their choices", () =>
    withRollback(async (c) => {
      const owner = await member(c);
      const ch = await channel(c, { ownerId: owner.userId, name: "Blessed Channel" });
      const g = await paid(c, null, ch, { donorName: "Sarah", amount: 40 });
      const b = await createBlessing(null, { donationId: g.donationId, token: g.token, message: "  Thank you!  ", showAmount: true }, c);
      expect(b).toMatchObject({ name: "Sarah", message: "Thank you!", amount: 40, channelHandle: ch.handle });
      expect(b.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      const { data } = await getChannelProfile(ch.handle, c);
      expect(data.blessingsCount).toBe(1);
      expect(data.blessings[0]).toMatchObject({ name: "Sarah", message: "Thank you!", amount: 40 });
      expect((await listNotifications(owner, {}, c)).items.map((n) => n.text)).toContain("Sarah left a blessing for Blessed Channel");
    }));

  it("with blessings switched off for the channel: hidden from its page, none can be left, and turning it back on restores them", () =>
    withRollback(async (c) => {
      const ch = await channel(c, { name: "Quiet Channel" });
      const first = await paid(c, null, ch, { donorName: "Early Giver" });
      await createBlessing(null, { donationId: first.donationId, token: first.token, message: "Before it was switched off" }, c);
      expect((await getChannelProfile(ch.handle, c)).data).toMatchObject({ showBlessings: true, blessingsCount: 1 });

      await c.query("update public.channels set show_blessings = false where id = $1", [ch.id]);
      const { data } = await getChannelProfile(ch.handle, c);
      expect(data).toMatchObject({ showBlessings: false, blessings: [], blessingsCount: 0 });
      expect(JSON.stringify(data)).not.toContain("Before it was switched off");

      const second = await paid(c, null, ch, { donorName: "Late Giver" });
      await expect(createBlessing(null, { donationId: second.donationId, token: second.token, message: "Too late" }, c)).rejects.toMatchObject({ code: "CONFLICT" });

      await c.query("update public.channels set show_blessings = true where id = $1", [ch.id]);
      expect((await getChannelProfile(ch.handle, c)).data).toMatchObject({ showBlessings: true, blessingsCount: 1 });
      expect((await getChannelProfile(ch.handle, c)).data.blessings[0].message).toBe("Before it was switched off");
      await createBlessing(null, { donationId: second.donationId, token: second.token, message: "Now it works" }, c);
    }));

  it("anonymous hides the name everywhere, including from the owner's notification", () =>
    withRollback(async (c) => {
      const owner = await member(c);
      const ch = await channel(c, { ownerId: owner.userId, name: "Private Channel" });
      const g = await paid(c, null, ch, { donorName: "Secret Person" });
      await createBlessing(null, { donationId: g.donationId, token: g.token, message: "Quietly", anonymous: true }, c);
      const { data } = await getChannelProfile(ch.handle, c);
      expect(data.blessings[0]).toMatchObject({ name: "Anonymous", message: "Quietly" });
      expect(data.blessings[0].amount).toBeUndefined();
      expect(JSON.stringify(data)).not.toContain("Secret Person");
      expect((await listNotifications(owner, {}, c)).items.map((n) => n.text)).toContain("Someone left a blessing for Private Channel");
    }));

  it("a guest with no name is shown as Anonymous; a member uses their display name", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const guest = await paid(c, null, ch);
      expect((await createBlessing(null, { donationId: guest.donationId, token: guest.token, message: "Hi" }, c)).name).toBe("Anonymous");
      const me = await member(c, { name: "Anjali Rao" });
      const mine = await paid(c, me, ch);
      expect((await createBlessing(me, { donationId: mine.donationId, message: "Hello" }, c)).name).toBe("Anjali Rao");
      expect((await createBlessing(me, { donationId: (await paid(c, me, ch)).donationId, message: "Hello again", displayName: "A. Rao" }, c)).name).toBe("A. Rao");
    }));

  it("needs a confirmed gift, allows only one per gift, and checks ownership", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const pending = await start(c, null, ch);
      await expect(createBlessing(null, { donationId: pending.donationId, token: pending.token, message: "Too early" }, c)).rejects.toMatchObject({ code: "CONFLICT" });

      const g = await paid(c, null, ch);
      await createBlessing(null, { donationId: g.donationId, token: g.token, message: "First" }, c);
      await expect(createBlessing(null, { donationId: g.donationId, token: g.token, message: "Second" }, c)).rejects.toMatchObject({ code: "CONFLICT" });

      const g2 = await paid(c, null, ch);
      await expect(createBlessing(null, { donationId: g2.donationId, message: "No token" }, c)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(createBlessing(null, { donationId: g2.donationId, token: "wrong-token-wrong-token", message: "x" }, c)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(createBlessing(await member(c), { donationId: g2.donationId, message: "x" }, c)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }));

  it("validates the message and is rate limited", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const g = await paid(c, null, ch);
      for (const message of ["", "   ", "x".repeat(501)]) {
        await expect(createBlessing(null, { donationId: g.donationId, token: g.token, message }, c)).rejects.toMatchObject({ name: "ZodError" });
      }
      await saturate(c, "blessing", g.donationId);
      await expect(createBlessing(null, { donationId: g.donationId, token: g.token, message: "ok" }, c)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    }));

  it("removed blessings leave the public page", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const g = await paid(c, null, ch);
      const b = await createBlessing(null, { donationId: g.donationId, token: g.token, message: "Rude" }, c);
      await c.query("update public.blessings set status = 'removed' where id = $1", [b.id]);
      const { data } = await getChannelProfile(ch.handle, c);
      expect(data.blessings).toEqual([]);
      expect(data.blessingsCount).toBe(0);
    }));
});
