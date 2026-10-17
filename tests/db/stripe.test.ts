import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { afterAll, describe, expect, it, vi } from "vitest";
import { getPool, type Queryable } from "@/server/db";
import { createStripeProvider, feeOf, mapStripeEvent } from "@/server/providers/payments/stripe";
import { assertStripeConfig, publishableKeyMode, stripeKeyMode } from "@/server/providers/payments/stripe-mode";
import { adminRefund, cancelMySubscription, startDonation } from "@/server/services/giving";
import { processStripeWebhook } from "@/server/services/stripe-webhook";
import { channel, FakeProvider, member } from "../helpers/fixtures";
import { withRollback } from "../helpers/rollback";

afterAll(async () => {
  await getPool().end();
});

const SECRET = "whsec_test_secret_for_unit_tests";
const RECEIPT = "https://pay.stripe.com/receipts/payment/CAcaFwoVYWNjdF8xVVAwQ2pQVVVWVHoyUGZEKJ";
const real = new Stripe("sk_test_unit_tests_only");

/** A Stripe client whose network calls are replaced; signature verification is the REAL implementation. */
function fakeStripe(over: Record<string, unknown> = {}) {
  const f = {
    webhooks: real.webhooks,
    customers: { create: vi.fn(async () => ({ id: "cus_1" })) },
    products: { create: vi.fn(async () => ({ id: "prod_1" })) },
    paymentIntents: {
      create: vi.fn(async () => ({ id: "pi_1", client_secret: "pi_1_secret" })),
      retrieve: vi.fn(async (id: string) => ({
        id,
        client_secret: `${id}_secret`,
        latest_charge: { balance_transaction: { fee: 103 }, receipt_url: RECEIPT },
      })),
    },
    subscriptions: {
      create: vi.fn(async () => ({
        id: "sub_1",
        latest_invoice: { id: "in_1", confirmation_secret: { client_secret: "in_1_secret" }, payments: { data: [{ payment: { type: "payment_intent", payment_intent: "pi_first" } }] } },
      })),
      cancel: vi.fn(async () => ({})),
    },
    invoicePayments: { list: vi.fn(async () => ({ data: [{ payment: { type: "payment_intent", payment_intent: "pi_renewal" } }] })) },
    refunds: { create: vi.fn(async () => ({ id: "re_1" })) },
    ...over,
  };
  return f as typeof f & Stripe;
}

const params = (over = {}) => ({
  donationId: "d-1",
  channel: { id: "c-1", handle: "quiet", name: "Quiet", stripeAccountId: null },
  amountCents: 2500,
  currency: "USD",
  frequency: "once" as const,
  donorEmail: "a@example.com",
  description: "Support for Quiet",
  ...over,
});

/* ------------------------------------------------------------------------ */
describe("stripe key / config safety", () => {
  it("recognises sandbox and live keys", () => {
    expect(stripeKeyMode("sk_test_abc")).toBe("test");
    expect(stripeKeyMode("rk_test_abc")).toBe("test");
    expect(stripeKeyMode("sk_live_abc")).toBe("live");
    expect(stripeKeyMode("nope")).toBeNull();
    expect(stripeKeyMode(undefined)).toBeNull();
    expect(publishableKeyMode("pk_test_x")).toBe("test");
    expect(publishableKeyMode("pk_live_x")).toBe("live");
    expect(publishableKeyMode("sk_test_x")).toBeNull();
  });

  const good = { NODE_ENV: "development", STRIPE_SECRET_KEY: "sk_test_a", STRIPE_PUBLISHABLE_KEY: "pk_test_a", STRIPE_WEBHOOK_SECRET: "whsec_a" };
  it("accepts a consistent sandbox setup", () => {
    expect(assertStripeConfig(good)).toBe("test");
  });
  it("refuses missing, malformed or mismatched settings", () => {
    expect(() => assertStripeConfig({ ...good, STRIPE_SECRET_KEY: undefined })).toThrow(/secret key/);
    expect(() => assertStripeConfig({ ...good, STRIPE_SECRET_KEY: "garbage" })).toThrow(/secret key/);
    expect(() => assertStripeConfig({ ...good, STRIPE_PUBLISHABLE_KEY: undefined })).toThrow(/PUBLISHABLE/);
    expect(() => assertStripeConfig({ ...good, STRIPE_PUBLISHABLE_KEY: "pk_live_a" })).toThrow(/test key but .* live/);
    expect(() => assertStripeConfig({ ...good, STRIPE_WEBHOOK_SECRET: undefined })).toThrow(/whsec_/);
    expect(() => assertStripeConfig({ ...good, STRIPE_WEBHOOK_SECRET: "abc" })).toThrow(/whsec_/);
  });
  it("never allows live keys outside production", () => {
    const live = { ...good, STRIPE_SECRET_KEY: "sk_live_a", STRIPE_PUBLISHABLE_KEY: "pk_live_a" };
    expect(() => assertStripeConfig(live)).toThrow(/only allowed in production/);
    expect(assertStripeConfig({ ...live, NODE_ENV: "production" })).toBe("live");
  });
});

/* ------------------------------------------------------------------------ */
describe("stripe provider adapter", () => {
  it("one-time gift: a card-only payment intent with our donation id and an idempotency key", async () => {
    const s = fakeStripe();
    const out = await createStripeProvider(s).createCheckout(params());
    expect(out).toEqual({ providerPaymentId: "pi_1", clientSecret: "pi_1_secret" });
    expect(s.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 2500, currency: "usd", metadata: { donation_id: "d-1", channel_handle: "quiet" }, allowed_payment_method_types: ["card"] }),
      { idempotencyKey: "donation:d-1" },
    );
  });

  it("monthly gift: customer, product and an incomplete subscription; returns the first invoice's payment intent", async () => {
    const s = fakeStripe();
    const out = await createStripeProvider(s).createCheckout(params({ frequency: "monthly" }));
    expect(out).toEqual({ providerPaymentId: "pi_first", clientSecret: "in_1_secret", providerCustomerId: "cus_1", providerSubscriptionId: "sub_1" });
    const args = (s.subscriptions.create.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(args).toMatchObject({
      customer: "cus_1",
      payment_behavior: "default_incomplete",
      payment_settings: { payment_method_types: ["card"] },
      items: [{ price_data: { currency: "usd", unit_amount: 2500, recurring: { interval: "month" }, product: "prod_1" } }],
    });
  });

  it("monthly gift: falls back to listing the invoice's payments when they were not expanded", async () => {
    const s = fakeStripe({
      subscriptions: { create: vi.fn(async () => ({ id: "sub_2", latest_invoice: { id: "in_2", confirmation_secret: { client_secret: "sec" }, payments: { data: [] } } })) },
    });
    const out = await createStripeProvider(s).createCheckout(params({ frequency: "monthly" }));
    expect(out.providerPaymentId).toBe("pi_renewal");
  });

  it("fails clearly when Stripe returns something unusable (so the donation is rolled back)", async () => {
    const noSecret = fakeStripe({ paymentIntents: { create: vi.fn(async () => ({ id: "pi_x", client_secret: null })) } });
    await expect(createStripeProvider(noSecret).createCheckout(params())).rejects.toThrow(/client secret/);
    const incomplete = fakeStripe({ subscriptions: { create: vi.fn(async () => ({ id: "sub_x", latest_invoice: null })) } });
    await expect(createStripeProvider(incomplete).createCheckout(params({ frequency: "monthly" }))).rejects.toThrow(/incomplete/);
  });

  it("resumes a checkout, cancels subscriptions (tolerating 'already gone'), and refunds with an idempotency key", async () => {
    const s = fakeStripe();
    const p = createStripeProvider(s);
    expect(await p.resumeCheckout("pi_9")).toEqual({ clientSecret: "pi_9_secret" });

    await p.cancelSubscription("sub_9");
    expect(s.subscriptions.cancel).toHaveBeenCalledWith("sub_9");
    s.subscriptions.cancel.mockRejectedValueOnce(Object.assign(new Error("gone"), { code: "resource_missing" }));
    await expect(p.cancelSubscription("sub_9")).resolves.toBeUndefined();
    s.subscriptions.cancel.mockRejectedValueOnce(Object.assign(new Error("boom"), { code: "api_error" }));
    await expect(p.cancelSubscription("sub_9")).rejects.toThrow("boom");

    expect(await p.refund("pi_9")).toEqual({ refundId: "re_1" });
    expect(s.refunds.create).toHaveBeenCalledWith({ payment_intent: "pi_9" }, { idempotencyKey: "refund:pi_9:full" });
  });
});

/* ------------------------------------------------------------------------ */
const ev = (type: string, object: Record<string, unknown>, id = `evt_${randomUUID()}`) => ({ id, object: "event", type, data: { object } }) as unknown as Stripe.Event;

describe("mapStripeEvent", () => {
  it("payment_intent.succeeded carries the fee and customer", async () => {
    const e = ev("payment_intent.succeeded", { id: "pi_1", customer: "cus_1" }, "evt_1");
    expect(await mapStripeEvent(e, fakeStripe())).toEqual({ type: "payment.succeeded", eventId: "evt_1", providerPaymentId: "pi_1", feeCents: 103, receiptUrl: RECEIPT, providerCustomerId: "cus_1" });
  });
  it("a fee that appears a moment after the event is still picked up", async () => {
    let calls = 0;
    const s = fakeStripe({ paymentIntents: { retrieve: vi.fn(async () => (++calls < 3 ? { latest_charge: { balance_transaction: null } } : { latest_charge: { balance_transaction: { fee: 59 } } })) } });
    expect(await feeOf(s, "pi_1", { delayMs: 1 })).toBe(59);
    expect(calls).toBe(3);
  });
  it("a receipt link that is not a Stripe page is dropped", async () => {
    const s = fakeStripe({ paymentIntents: { retrieve: vi.fn(async () => ({ latest_charge: { balance_transaction: { fee: 5 }, receipt_url: "https://evil.example/r" } })) } });
    const out = await mapStripeEvent(ev("payment_intent.succeeded", { id: "pi_1" }), s);
    expect(out).toMatchObject({ feeCents: 5 });
    expect(out).not.toHaveProperty("receiptUrl");
  });
  it("a failed fee lookup means fee 0, never a failed webhook", async () => {
    const s = fakeStripe({ paymentIntents: { retrieve: vi.fn(async () => { throw new Error("network"); }) } });
    expect(await feeOf(s, "pi_1", { attempts: 2, delayMs: 1 })).toBe(0);
  });
  it("payment_intent.payment_failed carries Stripe's message", async () => {
    const out = await mapStripeEvent(ev("payment_intent.payment_failed", { id: "pi_1", last_payment_error: { message: "Your card was declined." } }), fakeStripe());
    expect(out).toMatchObject({ type: "payment.failed", providerPaymentId: "pi_1", reason: "Your card was declined." });
    expect(await mapStripeEvent(ev("payment_intent.payment_failed", { id: "pi_1" }), fakeStripe())).toMatchObject({ reason: "The payment was declined." });
  });
  it("only a FULL refund counts", async () => {
    expect(await mapStripeEvent(ev("charge.refunded", { payment_intent: "pi_1", refunded: true }), fakeStripe())).toMatchObject({ type: "payment.refunded", providerPaymentId: "pi_1" });
    expect(await mapStripeEvent(ev("charge.refunded", { payment_intent: "pi_1", refunded: false }), fakeStripe())).toBeNull();
    expect(await mapStripeEvent(ev("charge.refunded", { refunded: true }), fakeStripe())).toBeNull();
  });
  it("invoice.paid maps renewals only (the first invoice is the donation itself)", async () => {
    const inv = (reason: string) => ({ id: "in_5", billing_reason: reason, amount_paid: 1100, currency: "usd", parent: { subscription_details: { subscription: "sub_5" } }, lines: { data: [{ period: { end: 1_800_000_000 } }] } });
    expect(await mapStripeEvent(ev("invoice.paid", inv("subscription_create")), fakeStripe())).toBeNull();
    const out = await mapStripeEvent(ev("invoice.paid", inv("subscription_cycle")), fakeStripe());
    expect(out).toMatchObject({ type: "subscription.renewed", providerSubscriptionId: "sub_5", providerPaymentId: "pi_renewal", receiptUrl: RECEIPT, amountCents: 1100, currency: "USD", feeCents: 103, periodEnd: new Date(1_800_000_000_000).toISOString() });
    expect(await mapStripeEvent(ev("invoice.paid", { ...inv("subscription_cycle"), amount_paid: 0 }), fakeStripe())).toBeNull();
  });
  it("renewal failure and cancellation", async () => {
    const failed = { billing_reason: "subscription_cycle", parent: { subscription_details: { subscription: "sub_5" } } };
    expect(await mapStripeEvent(ev("invoice.payment_failed", failed), fakeStripe())).toMatchObject({ type: "subscription.past_due", providerSubscriptionId: "sub_5" });
    expect(await mapStripeEvent(ev("invoice.payment_failed", { ...failed, billing_reason: "subscription_create" }), fakeStripe())).toBeNull();
    expect(await mapStripeEvent(ev("customer.subscription.deleted", { id: "sub_5" }), fakeStripe())).toMatchObject({ type: "subscription.canceled", providerSubscriptionId: "sub_5" });
  });
  it("ignores everything else", async () => {
    expect(await mapStripeEvent(ev("customer.created", { id: "cus_1" }), fakeStripe())).toBeNull();
    expect(await mapStripeEvent(ev("payment_intent.created", { id: "pi_1" }), fakeStripe())).toBeNull();
  });
});

/* ------------------------------------------------------------------------ */
/** A body + a REAL Stripe signature header for it. */
function signed(type: string, object: Record<string, unknown>, id = `evt_${randomUUID()}`, secret = SECRET, timestamp?: number) {
  const body = JSON.stringify({ id, object: "event", api_version: "2026-09-30.endive", created: 1, livemode: false, type, data: { object } });
  return { body, id, signature: real.webhooks.generateTestHeaderString({ payload: body, secret, ...(timestamp ? { timestamp } : {}) }) };
}
const hook = (c: Queryable, s: { body: string; signature: string | null }, stripe = fakeStripe()) =>
  processStripeWebhook({ body: s.body, signature: s.signature, secret: SECRET }, stripe, c);

const ctx = () => ({ ip: `test-${randomUUID()}` });
const begin = async (c: Queryable, ch: { handle: string }, over: Record<string, unknown> = {}) => {
  const fake = new FakeProvider();
  const s = await startDonation(null, { channelHandle: ch.handle, amount: 25, frequency: "once", donorEmail: "stripe@example.com", idempotencyKey: randomUUID(), ...over }, ctx(), c, fake);
  const row = (await c.query("select provider_payment_id p, provider_subscription_id sub from public.donations where id = $1", [s.donationId])).rows[0];
  return { ...s, pid: row.p as string, sub: row.sub as string | null };
};
const status = async (c: Queryable, id: string) => (await c.query("select status, fee_cents from public.donations where id = $1", [id])).rows[0];

describe("Stripe webhook end to end (real signature check, real handler)", () => {
  it("a signed payment_intent.succeeded marks the donation paid, queues the receipt and logs the event", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const d = await begin(c, ch);
      const e = signed("payment_intent.succeeded", { id: d.pid, customer: null });
      const r = await hook(c, e);
      expect(r).toEqual({ handled: true, duplicate: false, channelHandles: [ch.handle] });
      expect(await status(c, d.donationId)).toMatchObject({ status: "succeeded", fee_cents: 103 });
      expect((await c.query("select count(*)::int n from public.email_outbox where to_email = 'stripe@example.com'")).rows[0].n).toBe(1);
      expect((await c.query("select provider, type, processed_at is null as pending from public.payment_events where event_id = $1", [e.id])).rows[0]).toMatchObject({ provider: "stripe", type: "payment.succeeded" });
      expect((await c.query("select total_raised_cents from public.channels where id = $1", [ch.id])).rows[0].total_raised_cents).toBe(2500);
    }));

  it("the receipt link is stored on the donation and goes into the queued receipt email", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const d = await begin(c, ch);
      await hook(c, signed("payment_intent.succeeded", { id: d.pid }));
      expect((await c.query("select receipt_url from public.donations where id = $1", [d.donationId])).rows[0].receipt_url).toBe(RECEIPT);
      const mail = (await c.query("select payload from public.email_outbox where to_email = 'stripe@example.com' and template = 'donation_receipt'")).rows[0];
      expect(mail.payload.receiptUrl).toBe(RECEIPT);
    }));

  it("a renewal stores its own receipt link and emails it", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const d = await begin(c, ch, { frequency: "monthly", amount: 25 });
      await hook(c, signed("payment_intent.succeeded", { id: d.pid }));
      const invoice = { id: "in_r", billing_reason: "subscription_cycle", amount_paid: 2500, currency: "usd", parent: { subscription_details: { subscription: d.sub } }, lines: { data: [{ period: { end: 1_900_000_000 } }] } };
      await hook(c, signed("invoice.paid", invoice));
      const renewal = (await c.query("select receipt_url from public.donations where provider_payment_id = 'pi_renewal'")).rows[0];
      expect(renewal.receipt_url).toBe(RECEIPT);
      const mails = (await c.query("select payload from public.email_outbox where to_email = 'stripe@example.com' and template = 'donation_receipt'")).rows;
      expect(mails).toHaveLength(2);
      expect(mails.every((m) => m.payload.receiptUrl === RECEIPT)).toBe(true);
    }));

  it("the database refuses a receipt link that is not a Stripe page", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const d = await begin(c, ch);
      await expect(c.query("update public.donations set receipt_url = 'https://evil.example/x' where id = $1", [d.donationId])).rejects.toThrow(/check/);
    }));

  it("Stripe retrying the same delivery changes nothing", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const d = await begin(c, ch);
      const e = signed("payment_intent.succeeded", { id: d.pid });
      await hook(c, e);
      expect(await hook(c, e)).toMatchObject({ handled: true, duplicate: true });
      expect((await c.query("select count(*)::int n from public.email_outbox where to_email = 'stripe@example.com'")).rows[0].n).toBe(1);
      expect((await c.query("select total_raised_cents from public.channels where id = $1", [ch.id])).rows[0].total_raised_cents).toBe(2500);
    }));

  it("rejects missing, wrong, tampered and stale signatures without touching anything", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const d = await begin(c, ch);
      const e = signed("payment_intent.succeeded", { id: d.pid });
      await expect(hook(c, { body: e.body, signature: null })).rejects.toMatchObject({ code: "VALIDATION" });
      await expect(hook(c, { body: e.body, signature: "t=1,v1=deadbeef" })).rejects.toMatchObject({ code: "VALIDATION" });
      const other = signed("payment_intent.succeeded", { id: d.pid }, undefined, "whsec_someone_elses_secret");
      await expect(hook(c, other)).rejects.toMatchObject({ code: "VALIDATION" });
      await expect(hook(c, { body: e.body.replace(d.pid, "pi_other"), signature: e.signature })).rejects.toMatchObject({ code: "VALIDATION" });
      const stale = signed("payment_intent.succeeded", { id: d.pid }, undefined, SECRET, Math.floor(Date.now() / 1000) - 3600);
      await expect(hook(c, stale)).rejects.toMatchObject({ code: "VALIDATION" });
      expect((await status(c, d.donationId)).status).toBe("pending");
      expect((await c.query("select count(*)::int n from public.payment_events where provider = 'stripe' and payload->>'providerPaymentId' = $1", [d.pid])).rows[0].n).toBe(0);
    }));

  it("a declined card marks the donation failed, and a later successful retry on the same intent completes it", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const d = await begin(c, ch);
      await hook(c, signed("payment_intent.payment_failed", { id: d.pid, last_payment_error: { message: "Your card has insufficient funds." } }));
      expect((await c.query("select status, failure_reason from public.donations where id = $1", [d.donationId])).rows[0]).toEqual({ status: "failed", failure_reason: "Your card has insufficient funds." });
      await hook(c, signed("payment_intent.succeeded", { id: d.pid }));
      expect((await status(c, d.donationId)).status).toBe("succeeded");
    }));

  it("a full refund from the Stripe dashboard flips it to refunded; a partial one does not", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const d = await begin(c, ch);
      await hook(c, signed("payment_intent.succeeded", { id: d.pid }));
      expect(await hook(c, signed("charge.refunded", { payment_intent: d.pid, refunded: false }))).toMatchObject({ handled: false });
      expect((await status(c, d.donationId)).status).toBe("succeeded");
      await hook(c, signed("charge.refunded", { payment_intent: d.pid, refunded: true }));
      expect((await status(c, d.donationId)).status).toBe("refunded");
    }));

  it("an admin refund followed by Stripe's own charge.refunded event is not double counted", () =>
    withRollback(async (c) => {
      const admin = await member(c, { role: "admin" });
      const ch = await channel(c);
      const d = await begin(c, ch);
      await hook(c, signed("payment_intent.succeeded", { id: d.pid }));
      await adminRefund(admin, d.donationId, { reason: "Requested by donor" }, c, new FakeProvider());
      const mails = async () => (await c.query("select count(*)::int n from public.email_outbox where template = 'donation_refunded' and to_email = 'stripe@example.com'")).rows[0].n;
      expect(await mails()).toBe(1);
      await hook(c, signed("charge.refunded", { payment_intent: d.pid, refunded: true }));
      expect((await status(c, d.donationId)).status).toBe("refunded");
      expect(await mails()).toBe(1);
      expect((await c.query("select total_raised_cents from public.channels where id = $1", [ch.id])).rows[0].total_raised_cents).toBe(0);
    }));

  it("subscription lifecycle: first payment, renewal, failed renewal, cancellation", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const d = await begin(c, ch, { frequency: "monthly", amount: 25 });
      await hook(c, signed("payment_intent.succeeded", { id: d.pid, customer: "cus_x" }));
      const sub = (await c.query("select id, status, provider_subscription_id from public.subscriptions where provider_subscription_id = $1", [d.sub])).rows[0];
      expect(sub.status).toBe("active");

      const invoice = { id: "in_r", billing_reason: "subscription_cycle", amount_paid: 2500, currency: "usd", parent: { subscription_details: { subscription: d.sub } }, lines: { data: [{ period: { end: 1_900_000_000 } }] } };
      await hook(c, signed("invoice.paid", invoice));
      const donations = (await c.query("select status, amount_cents, provider_payment_id from public.donations where subscription_id = $1 order by created_at", [sub.id])).rows;
      expect(donations).toHaveLength(2);
      // (rows created in one test transaction share a timestamp, so find the renewal by its payment id, not by position)
      expect(donations.find((x) => x.provider_payment_id === "pi_renewal")).toMatchObject({ status: "succeeded", amount_cents: 2500 });

      await hook(c, signed("invoice.payment_failed", { ...invoice, id: "in_f" }));
      expect((await c.query("select status from public.subscriptions where id = $1", [sub.id])).rows[0].status).toBe("past_due");

      await hook(c, signed("customer.subscription.deleted", { id: d.sub }));
      expect((await c.query("select status from public.subscriptions where id = $1", [sub.id])).rows[0].status).toBe("canceled");
    }));

  it("a member cancelling a subscription asks Stripe, and Stripe's confirmation event is harmless", () =>
    withRollback(async (c) => {
      const me = await member(c);
      const ch = await channel(c);
      const fake = new FakeProvider();
      const s = await startDonation(me, { channelHandle: ch.handle, amount: 25, frequency: "monthly", idempotencyKey: randomUUID() }, ctx(), c, fake);
      const row = (await c.query("select provider_payment_id p, provider_subscription_id sub from public.donations where id = $1", [s.donationId])).rows[0];
      await hook(c, signed("payment_intent.succeeded", { id: row.p }));
      const subId = (await c.query("select id from public.subscriptions where provider_subscription_id = $1", [row.sub])).rows[0].id;
      await cancelMySubscription(me, subId, c, fake);
      expect(fake.canceled).toEqual([row.sub]);
      await hook(c, signed("customer.subscription.deleted", { id: row.sub }));
      expect((await c.query("select status from public.subscriptions where id = $1", [subId])).rows[0].status).toBe("canceled");
    }));

  it("unknown event types and payments we have no donation for are acknowledged, not errors", () =>
    withRollback(async (c) => {
      expect(await hook(c, signed("customer.created", { id: "cus_1" }))).toMatchObject({ handled: false, duplicate: false });
      expect(await hook(c, signed("payment_intent.succeeded", { id: `pi_${randomUUID()}` }))).toMatchObject({ handled: false });
    }));
});

/* ------------------------------------------------------------------------ */
// This one commits real rows: the point is that a failure rolls the whole delivery back for real.
describe("Stripe webhook failure handling (real transactions)", () => {
  const tag = `stripefail_${randomUUID().slice(0, 8)}`;
  const email = `${tag}@example.com`;
  let channelId = "";

  afterAll(async () => {
    const pool = getPool();
    await pool.query("delete from public.payment_events where provider = 'stripe' and payload->>'providerPaymentId' like $1", [`pi_${tag}%`]);
    await pool.query("delete from public.email_outbox where to_email = $1", [email]);
    await pool.query("delete from public.donations where channel_id = $1", [channelId]);
    await pool.query("delete from public.channels where id = $1", [channelId]);
  });

  it("a failure while applying answers with an error, leaves nothing behind, and the retry then succeeds", async () => {
    const pool = getPool();
    const handle = `sf${randomUUID().replace(/-/g, "").slice(0, 10)}`;
    channelId = (await pool.query("insert into public.channels (handle, name, category, status) values ($1, 'Stripe Failure Channel', 'faith', 'active') returning id", [handle])).rows[0].id;
    const pid = `pi_${tag}`;
    const donationId = (
      await pool.query(
        "insert into public.donations (channel_id, donor_email, amount_cents, currency, provider, provider_payment_id) values ($1, $2, 2500, 'USD', 'stripe', $3) returning id",
        [channelId, email, pid],
      )
    ).rows[0].id as string;

    const e = signed("payment_intent.succeeded", { id: pid });
    const args = { body: e.body, signature: e.signature, secret: SECRET };

    // First delivery: the donation update fails mid-transaction.
    // Pooled clients are reused, so the patched query must switch itself off again.
    let failing = true;
    const originalConnect = pool.connect.bind(pool);
    const spy = vi.spyOn(pool, "connect").mockImplementation((async () => {
      const client = await originalConnect();
      const query = client.query.bind(client) as (...a: unknown[]) => unknown;
      (client as unknown as { query: unknown }).query = (sql: unknown, ...rest: unknown[]) =>
        failing && typeof sql === "string" && /update public\.donations set status = 'succeeded'/.test(sql) ? Promise.reject(new Error("db down")) : query(sql, ...rest);
      return client;
    }) as never);
    await expect(processStripeWebhook(args, fakeStripe())).rejects.toThrow("db down");
    failing = false;
    spy.mockRestore();

    expect((await pool.query("select status from public.donations where id = $1", [donationId])).rows[0].status).toBe("pending");
    expect((await pool.query("select count(*)::int n from public.payment_events where event_id = $1", [e.id])).rows[0].n).toBe(0);
    expect((await pool.query("select count(*)::int n from public.email_outbox where to_email = $1", [email])).rows[0].n).toBe(0);

    // Stripe retries the same event: it now goes through, exactly once.
    expect(await processStripeWebhook(args, fakeStripe())).toMatchObject({ handled: true, duplicate: false });
    expect(await processStripeWebhook(args, fakeStripe())).toMatchObject({ duplicate: true });
    expect((await pool.query("select status from public.donations where id = $1", [donationId])).rows[0].status).toBe("succeeded");
    expect((await pool.query("select count(*)::int n from public.email_outbox where to_email = $1", [email])).rows[0].n).toBe(1);
  });
});
