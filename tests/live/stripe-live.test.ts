import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { afterAll, describe, expect, it } from "vitest";
import { db, getPool } from "@/server/db";
import { createStripeProvider } from "@/server/providers/payments/stripe";
import { startDonation } from "@/server/services/giving";

/**
 * LIVE sandbox check: real Stripe API calls in TEST mode, real webhooks delivered by `stripe listen`
 * to the running dev server, real database rows. Skipped unless STRIPE_LIVE_TEST=1.
 *
 *   stripe listen --api-key <rk_test…> --forward-to localhost:3000/api/webhooks/stripe   (keep running)
 *   STRIPE_LIVE_TEST=1 npx vitest run tests/live/stripe-live.test.ts
 *
 * Everything it creates in our database is deleted afterwards.
 */
const live = process.env.STRIPE_LIVE_TEST === "1" && !!process.env.STRIPE_SECRET_KEY?.match(/^(sk|rk)_test_/);

const tag = `live_${randomUUID().slice(0, 8)}`;
const email = `${tag}@example.com`;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_missing");
const provider = createStripeProvider(stripe);
let channelId = "";
let handle = "";
const paymentIds: string[] = [];
const subscriptionIds: string[] = [];

async function waitFor<T>(what: string, fn: () => Promise<T | null | false | undefined>, ms = 45_000): Promise<T> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timed out waiting for: ${what} (is \`stripe listen\` running and forwarding to the dev server?)`);
}

const donation = async (id: string) => (await getPool().query("select status, fee_cents, failure_reason, subscription_id, amount_cents from public.donations where id = $1", [id])).rows[0];
const begin = (over: Record<string, unknown> = {}) =>
  startDonation(null, { channelHandle: handle, amount: 25, frequency: "once", donorEmail: email, idempotencyKey: randomUUID(), ...over }, { ip: `live-${tag}` }, db, provider);

afterAll(async () => {
  if (!live) return;
  const pool = getPool();
  const donationIds = (await pool.query("select id, provider_payment_id p, provider_subscription_id s from public.donations where channel_id = $1", [channelId])).rows;
  for (const d of donationIds) {
    if (d.p) paymentIds.push(d.p);
    if (d.s) subscriptionIds.push(d.s);
  }
  for (const s of new Set(subscriptionIds)) await stripe.subscriptions.cancel(s).catch(() => {});
  await pool.query("delete from public.payment_events where provider = 'stripe' and (payload->>'providerPaymentId' = any($1) or payload->>'providerSubscriptionId' = any($2))", [paymentIds, subscriptionIds]);
  await pool.query("delete from public.email_outbox where to_email = $1", [email]);
  await pool.query("delete from public.notifications where href like $1", [`/channels/${handle}`]);
  await pool.query("delete from public.donations where channel_id = $1", [channelId]);
  await pool.query("delete from public.subscriptions where channel_id = $1", [channelId]);
  await pool.query("delete from public.channels where id = $1", [channelId]);
  await pool.end();
});

describe.skipIf(!live)("Stripe sandbox, end to end", () => {
  it("setup: a throwaway active channel", async () => {
    handle = `lv${randomUUID().replace(/-/g, "").slice(0, 10)}`;
    channelId = (await getPool().query("insert into public.channels (handle, name, category, status) values ($1, 'Live Test Channel', 'faith', 'active') returning id", [handle])).rows[0].id;
    expect(channelId).toBeTruthy();
  });

  it("one-time gift: real PaymentIntent -> card accepted -> webhook marks it succeeded with Stripe's fee and a queued receipt", async () => {
    const d = await begin();
    expect(d).toMatchObject({ provider: "stripe", status: "pending", amountCents: 2500 });
    expect(d.clientSecret).toMatch(/^pi_.*_secret_/);
    const pid = (await getPool().query("select provider_payment_id p from public.donations where id = $1", [d.donationId])).rows[0].p as string;
    paymentIds.push(pid);

    const pi = await stripe.paymentIntents.confirm(pid, { payment_method: "pm_card_visa", return_url: "https://example.com/return" });
    expect(["succeeded", "processing"]).toContain(pi.status);

    const row = await waitFor("donation succeeded", async () => {
      const r = await donation(d.donationId);
      return r.status === "succeeded" ? r : null;
    });
    expect(row.fee_cents).toBeGreaterThan(0);
    expect(row.fee_cents).toBeLessThan(2500);

    // Stripe's hosted receipt page: stored on the donation, put in the receipt email, and really opens.
    const stored = (await getPool().query("select receipt_url from public.donations where id = $1", [d.donationId])).rows[0].receipt_url as string;
    expect(stored).toMatch(/^https:\/\/pay\.stripe\.com\/receipts\//);
    const mailPayload = (await getPool().query("select payload from public.email_outbox where to_email = $1 and template = 'donation_receipt'", [email])).rows[0].payload;
    expect(mailPayload.receiptUrl).toBe(stored);
    expect((await fetch(stored)).status).toBe(200);
    expect((await getPool().query("select count(*)::int n from public.email_outbox where to_email = $1 and template = 'donation_receipt'", [email])).rows[0].n).toBe(1);
    expect((await getPool().query("select total_raised_cents from public.channels where id = $1", [channelId])).rows[0].total_raised_cents).toBe(2500);

    // Refund it on Stripe's side: charge.refunded must flip it to refunded and take it out of the totals.
    await provider.refund(pid);
    await waitFor("donation refunded", async () => ((await donation(d.donationId)).status === "refunded" ? true : null));
    expect((await getPool().query("select total_raised_cents from public.channels where id = $1", [channelId])).rows[0].total_raised_cents).toBe(0);
  });

  it("declined card: payment_failed webhook marks it failed with Stripe's reason; paying again on the same intent succeeds", async () => {
    const d = await begin();
    const pid = (await getPool().query("select provider_payment_id p from public.donations where id = $1", [d.donationId])).rows[0].p as string;
    paymentIds.push(pid);

    await expect(stripe.paymentIntents.confirm(pid, { payment_method: "pm_card_chargeDeclined", return_url: "https://example.com/return" })).rejects.toThrow(/declined/i);
    const failed = await waitFor("donation failed", async () => {
      const r = await donation(d.donationId);
      return r.status === "failed" ? r : null;
    });
    expect(failed.failure_reason).toMatch(/declined/i);

    await stripe.paymentIntents.confirm(pid, { payment_method: "pm_card_visa", return_url: "https://example.com/return" });
    await waitFor("donation succeeded after retry", async () => ((await donation(d.donationId)).status === "succeeded" ? true : null));
  });

  it("monthly gift: real subscription -> first invoice paid -> subscription row; cancelling on Stripe cancels it here", async () => {
    const d = await begin({ frequency: "monthly", amount: 25 });
    const row = (await getPool().query("select provider_payment_id p, provider_subscription_id s from public.donations where id = $1", [d.donationId])).rows[0];
    paymentIds.push(row.p);
    subscriptionIds.push(row.s);
    expect(row.s).toMatch(/^sub_/);
    expect(d.clientSecret).toBeTruthy();

    await stripe.paymentIntents.confirm(row.p, { payment_method: "pm_card_visa", return_url: "https://example.com/return" });
    const paid = await waitFor("monthly donation succeeded", async () => {
      const r = await donation(d.donationId);
      return r.status === "succeeded" && r.subscription_id ? r : null;
    });
    expect(paid.amount_cents).toBe(2500);
    expect((await getPool().query("select status from public.subscriptions where provider_subscription_id = $1", [row.s])).rows[0].status).toBe("active");

    await provider.cancelSubscription(row.s);
    await waitFor("subscription canceled", async () => {
      const r = (await getPool().query("select status from public.subscriptions where provider_subscription_id = $1", [row.s])).rows[0];
      return r.status === "canceled" ? true : null;
    });
  });
});
