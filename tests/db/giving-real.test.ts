import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, getPool, one, rows } from "@/server/db";
import { createBlessing } from "@/server/services/blessings";
import { getChannelProfile } from "@/server/services/channels";
import { claimDue, enqueueEmail, processOutbox } from "@/server/services/email";
import { adminRefund, getDonationStatus, simulateMockPayment, startDonation } from "@/server/services/giving";
import { FakeProvider, FakeSender } from "../helpers/fixtures";

/**
 * Against the REAL database with COMMITTED rows (no rollback), to prove the things a rolled-back
 * transaction can't: atomic failure, concurrent retries and parallel email workers.
 * Everything created here is deleted in afterAll.
 */

const TAG = `gr-${randomUUID().slice(0, 8)}`;
let channelId = "";
let handle = "";
let adminId = "";
const ctx = () => ({ ip: `test-${randomUUID()}` });
const email = (n: string) => `${TAG}-${n}@example.com`;
const gift = (over: Record<string, unknown> = {}) => ({
  channelHandle: handle,
  amount: 25,
  donorEmail: email("guest"),
  idempotencyKey: randomUUID(),
  ...over,
});

beforeAll(async () => {
  handle = `gr_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  channelId = (await one<{ id: string }>(
    "insert into public.channels (handle, name, category, status) values ($1, 'Real Giving Test', 'faith', 'active') returning id",
    [handle],
  ))!.id;
  adminId = randomUUID();
});

afterAll(async () => {
  const donationIds = (await rows<{ id: string }>("select id from public.donations where channel_id = $1", [channelId])).map((r) => r.id);
  await db.query("delete from public.payment_events where payload::text like $1", [`%mock_pi_%`]).catch(() => {});
  await db.query("delete from public.audit_log where entity_id = any($1::text[])", [donationIds]);
  await db.query("delete from public.donations where channel_id = $1", [channelId]); // blessings cascade
  await db.query("delete from public.subscriptions where channel_id = $1", [channelId]);
  await db.query("delete from public.channels where id = $1", [channelId]);
  await db.query("delete from public.email_outbox where to_email::text like $1", [`${TAG}%`]);
  await db.query("delete from public.rate_limits");
  await getPool().end();
});

describe("atomicity", () => {
  it("a payment provider failure leaves no donation behind and says nothing was charged", async () => {
    const prov = new FakeProvider();
    prov.failCheckout = true;
    const key = randomUUID();
    await expect(startDonation(null, gift({ idempotencyKey: key }), ctx(), db, prov)).rejects.toMatchObject({
      code: "PAYMENT_FAILED",
      message: expect.stringContaining("haven't been charged"),
    });
    expect(await one("select 1 from public.donations where idempotency_key = $1", [key])).toBeNull();
    // and the very same key works once the provider recovers
    prov.failCheckout = false;
    const ok = await startDonation(null, gift({ idempotencyKey: key }), ctx(), db, prov);
    expect(ok.status).toBe("pending");
  });

  it("a failed provider refund leaves the donation completed (nothing is half-done)", async () => {
    const real = await startDonation(null, gift({ donorEmail: email("refund-fail") }), ctx(), db);
    await simulateMockPayment(null, { donationId: real.donationId, token: real.token, outcome: "succeeded" });
    const prov = new FakeProvider();
    prov.failRefund = true;
    const admin = { userId: adminId, username: "x", displayName: "Admin", role: "admin" as const, status: "active" as const };
    // the audit row references the actor, so make a real admin profile for this test
    const { createAdminClient } = await import("@/server/auth/supabase");
    const { data } = await createAdminClient().auth.admin.createUser({ email: email("admin"), password: "Correct-horse-9", email_confirm: true });
    admin.userId = data.user!.id;
    adminId = admin.userId;
    await db.query("update public.profiles set role = 'admin' where id = $1", [admin.userId]);
    try {
      await expect(adminRefund(admin, real.donationId, { reason: "test" }, db, prov)).rejects.toThrow("refund failed");
      expect((await one<{ status: string }>("select status from public.donations where id = $1", [real.donationId]))?.status).toBe("succeeded");
      expect(await one("select 1 from public.audit_log where entity_id = $1", [real.donationId])).toBeNull();
    } finally {
      await createAdminClient().auth.admin.deleteUser(admin.userId);
    }
  });
});

describe("concurrency", () => {
  it("two simultaneous requests with the same key create exactly one donation", async () => {
    const prov = new FakeProvider();
    const input = gift({ idempotencyKey: randomUUID(), donorEmail: email("race") });
    const [a, b] = await Promise.all([startDonation(null, input, ctx(), db, prov), startDonation(null, input, ctx(), db, prov)]);
    expect(b.donationId).toBe(a.donationId);
    expect(b.token).toBe(a.token);
    const n = await one<{ n: number }>("select count(*) as n from public.donations where idempotency_key = $1", [input.idempotencyKey]);
    expect(n!.n).toBe(1);
    expect(prov.checkouts).toHaveLength(1); // the loser never reached the provider
  });

  it("parallel email workers never take the same email", async () => {
    for (let i = 0; i < 8; i++) {
      await enqueueEmail(db, { to: email(`claim${i}`), template: "donation_refunded", payload: { channelName: "X", amountCents: 100, currency: "USD" } });
    }
    const ours = (await rows<{ id: string }>("select id from public.email_outbox where to_email::text like $1", [`${TAG}-claim%`])).map((r) => r.id);
    const [a, b, c] = await Promise.all([claimDue(3, db, ours), claimDue(3, db, ours), claimDue(3, db, ours)]);
    const mine = [...a, ...b, ...c].filter((r) => r.to_email.startsWith(`${TAG}-claim`));
    const ids = mine.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length); // no email claimed twice
    expect(ids.length).toBeLessThanOrEqual(8);
    // everything we claimed is now 'sending'; release the rest of the test rows
    await db.query("delete from public.email_outbox where to_email::text like $1", [`${TAG}%`]);
  });
});

describe("a full gift, end to end, on the real mock provider", () => {
  it("start -> pay -> receipt email -> blessing -> public page -> refund", async () => {
    const guest = email("flow");
    const g = await startDonation(null, gift({ donorEmail: guest, donorName: "Sarah", amount: 40 }), ctx(), db);
    expect(g).toMatchObject({ status: "pending", provider: "mock", clientSecret: expect.stringMatching(/^mock_secret_/) });

    // nothing is public until the provider confirms
    const baseline = (await getChannelProfile(handle)).channel.supporters;

    const paid = await simulateMockPayment(null, { donationId: g.donationId, token: g.token, outcome: "succeeded" });
    expect(paid).toMatchObject({ status: "succeeded", channelHandles: [handle] });
    expect(await getDonationStatus(null, { donationId: g.donationId, token: g.token })).toMatchObject({ status: "succeeded", canLeaveBlessing: true });
    expect((await getChannelProfile(handle)).channel.supporters).toBe(baseline + 1);

    // the queued receipt is delivered by the worker (only our row is checked; the sender is a fake)
    const sender = new FakeSender();
    const receiptIds = (await rows<{ id: string }>("select id from public.email_outbox where to_email = $1", [guest])).map((r) => r.id);
    expect(receiptIds).toHaveLength(1);
    await processOutbox({ ids: receiptIds }, sender);
    const mail = sender.sent.find((m) => m.to === guest);
    expect(mail).toBeDefined();
    expect(mail!.subject).toBe("Thank you for supporting Real Giving Test");
    expect(mail!.text).toContain("Amount: $40");
    expect((await one<{ receipt_sent_at: Date | null }>("select receipt_sent_at from public.donations where id = $1", [g.donationId]))?.receipt_sent_at).not.toBeNull();

    const blessing = await createBlessing(null, { donationId: g.donationId, token: g.token, message: "Keep going!", showAmount: true });
    expect(blessing).toMatchObject({ name: "Sarah", amount: 40 });
    const profile = await getChannelProfile(handle);
    expect(profile.data.blessings[0]).toMatchObject({ name: "Sarah", message: "Keep going!", amount: 40 });
    expect(profile.data.blessingsCount).toBe(1);

    // the provider replays the same webhook: nothing changes
    const replay = await simulateMockPayment(null, { donationId: g.donationId, token: g.token, outcome: "succeeded" });
    expect(replay.status).toBe("succeeded");
    expect((await getChannelProfile(handle)).channel.supporters).toBe(baseline + 1);
    expect((await one<{ n: number }>("select count(*) as n from public.email_outbox where to_email = $1 and template = 'donation_receipt'", [guest]))!.n).toBe(1);

    const refunded = await simulateMockPayment(null, { donationId: g.donationId, token: g.token, outcome: "refunded" });
    expect(refunded.status).toBe("refunded");
    expect((await getChannelProfile(handle)).channel.supporters).toBe(baseline);
  });
});
