import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { afterAll, describe, expect, it } from "vitest";
import { db, getPool } from "@/server/db";
import { createStripeProvider } from "@/server/providers/payments/stripe";
import { startDonation } from "@/server/services/giving";

/**
 * LIVE sandbox check of monthly renewals, using Stripe TEST CLOCKS: Stripe's own way to jump time
 * forward in the sandbox, so a month passes in seconds and Stripe really charges the saved card and
 * really fires its webhooks. Skipped unless STRIPE_LIVE_TEST=1 (needs `stripe listen` forwarding).
 *
 *   STRIPE_LIVE_TEST=1 npx vitest run tests/live/stripe-renewal.test.ts
 */
const live = process.env.STRIPE_LIVE_TEST === "1" && !!process.env.STRIPE_SECRET_KEY?.match(/^(sk|rk)_test_/);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_missing");
const tag = `renew_${randomUUID().slice(0, 8)}`;
const email = `${tag}@example.com`;
const clocks: string[] = [];
const channelIds: string[] = [];
const subscriptionIds: string[] = [];
const HOUR = 3600;

/** Same day next month; a 31st lands on the last day of shorter months (what Stripe does). */
function addMonths(from: Date, months: number, anchorDay: number): Date {
  const t = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, 1, from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds()));
  const daysInMonth = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(anchorDay, daysInMonth));
  return t;
}
const day = (d: Date) => d.toISOString().slice(0, 10);

async function waitFor<T>(what: string, fn: () => Promise<T | null | false | undefined>, ms = 120_000): Promise<T> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Timed out waiting for: ${what} (is \`stripe listen\` running?)`);
}

/** Creates a customer attached to the test clock, so the subscription lives in clock time. */
function clockedStripe(clockId: string): Stripe {
  return new Proxy(stripe, {
    get(target, prop, receiver) {
      if (prop === "customers") {
        return { create: (params: Stripe.CustomerCreateParams, opts?: Stripe.RequestOptions) => target.customers.create({ ...params, test_clock: clockId }, opts) };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

async function advanceTo(clockId: string, to: Date) {
  await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: Math.floor(to.getTime() / 1000) });
  await waitFor("test clock ready", async () => ((await stripe.testHelpers.testClocks.retrieve(clockId)).status === "ready" ? true : null), 180_000);
}

const periodEnd = async (subId: string) => {
  const sub = (await stripe.subscriptions.retrieve(subId)) as unknown as { items: { data: { current_period_end: number }[] } };
  return new Date(sub.items.data[0].current_period_end * 1000);
};
const donationsOf = async (subId: string) =>
  (await getPool().query("select status, amount_cents, fee_cents, provider_payment_id from public.donations where provider_subscription_id = $1 order by created_at", [subId])).rows;
const subRow = async (subId: string) =>
  (await getPool().query("select status, current_period_end from public.subscriptions where provider_subscription_id = $1", [subId])).rows[0];

/** Starts a real monthly gift on a clock that begins at `start`, pays the first invoice, returns ids. */
async function subscribe(start: Date) {
  const clock = await stripe.testHelpers.testClocks.create({ frozen_time: Math.floor(start.getTime() / 1000), name: `${tag}-${day(start)}` });
  clocks.push(clock.id);
  const handle = `rn${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const channelId = (await getPool().query("insert into public.channels (handle, name, category, status) values ($1, 'Renewal Test Channel', 'faith', 'active') returning id", [handle])).rows[0].id as string;
  channelIds.push(channelId);

  const provider = createStripeProvider(clockedStripe(clock.id));
  const d = await startDonation(null, { channelHandle: handle, amount: 10, frequency: "monthly", donorEmail: email, idempotencyKey: randomUUID() }, { ip: `live-${tag}` }, db, provider);
  const row = (await getPool().query("select provider_payment_id p, provider_subscription_id s from public.donations where id = $1", [d.donationId])).rows[0];
  subscriptionIds.push(row.s);
  await stripe.paymentIntents.confirm(row.p, { payment_method: "pm_card_visa", return_url: "https://example.com/return" });
  await waitFor("first payment recorded", async () => ((await donationsOf(row.s)).some((x) => x.status === "succeeded") ? true : null));
  return { clock, sub: row.s as string, channelId };
}

afterAll(async () => {
  if (!live) return;
  const pool = getPool();
  for (const id of clocks) await stripe.testHelpers.testClocks.del(id).catch(() => {}); // also removes its customers and subscriptions
  await new Promise((r) => setTimeout(r, 10_000)); // Stripe then sends "subscription deleted" webhooks; let them land before cleaning up
  await pool.query("delete from public.payment_events where provider = 'stripe' and (payload->>'providerSubscriptionId' = any($1) or payload->>'providerPaymentId' in (select provider_payment_id from public.donations where channel_id = any($2)))", [subscriptionIds, channelIds]);
  await pool.query("delete from public.email_outbox where to_email = $1", [email]);
  await pool.query("delete from public.notifications where href in (select '/channels/' || handle from public.channels where id = any($1))", [channelIds]);
  await pool.query("delete from public.donations where channel_id = any($1)", [channelIds]);
  await pool.query("delete from public.subscriptions where channel_id = any($1)", [channelIds]);
  await pool.query("delete from public.channels where id = any($1)", [channelIds]);
  await pool.end();
});

describe.skipIf(!live)("monthly renewals on Stripe test clocks", () => {
  it("renews every month on the same day, charges the saved card, records each payment, and flags a failed renewal", async () => {
    const start = new Date(); // subscribing today
    const anchorDay = start.getUTCDate();
    const { clock, sub, channelId } = await subscribe(start);

    // 1. Right after subscribing: one payment, active, next charge due one calendar month later.
    const first = addMonths(start, 1, anchorDay);
    expect(Math.abs((await periodEnd(sub)).getTime() - first.getTime())).toBeLessThan(120_000);
    expect(await donationsOf(sub)).toHaveLength(1);
    expect((await subRow(sub)).status).toBe("active");

    // 2. A month passes (Stripe invoices, then charges an hour later): 2nd payment appears by itself.
    await advanceTo(clock.id, new Date(first.getTime() + 2 * HOUR * 1000));
    await waitFor("2nd payment", async () => ((await donationsOf(sub)).length >= 2 ? true : null));
    const list = await donationsOf(sub);
    expect(list).toHaveLength(2);
    expect(list[1]).toMatchObject({ status: "succeeded", amount_cents: 1000 });
    expect(list[1].fee_cents).toBeGreaterThan(0);
    const second = addMonths(start, 2, anchorDay);
    expect(day(await periodEnd(sub))).toBe(day(second));
    expect(day((await subRow(sub)).current_period_end)).toBe(day(second)); // our record says the same day as Stripe
    expect((await getPool().query("select count(*)::int n from public.email_outbox where to_email = $1 and template = 'donation_receipt'", [email])).rows[0].n).toBe(2);
    expect((await getPool().query("select total_raised_cents from public.channels where id = $1", [channelId])).rows[0].total_raised_cents).toBe(2000);

    // 3. Another month: 3rd payment, still the same day.
    await advanceTo(clock.id, new Date(second.getTime() + 2 * HOUR * 1000));
    await waitFor("3rd payment", async () => ((await donationsOf(sub)).length >= 3 ? true : null));
    const third = addMonths(start, 3, anchorDay);
    expect(day(await periodEnd(sub))).toBe(day(third));
    expect(day((await subRow(sub)).current_period_end)).toBe(day(third));
    expect((await donationsOf(sub)).filter((x) => x.status === "succeeded")).toHaveLength(3);

    // 4. The card stops working: the next renewal fails and the subscription is flagged past_due.
    const customer = (await stripe.subscriptions.retrieve(sub)).customer as string;
    const bad = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", { customer });
    await stripe.subscriptions.update(sub, { default_payment_method: bad.id });
    await advanceTo(clock.id, new Date(third.getTime() + 2 * HOUR * 1000));
    await waitFor("subscription past_due", async () => ((await subRow(sub)).status === "past_due" ? true : null));
    expect(await donationsOf(sub)).toHaveLength(3); // no money, no new payment row
  }, 600_000);

  it("a subscription started on the 31st renews on the last day of short months, then returns to the 31st", async () => {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear() + (now.getUTCMonth() >= 0 ? 1 : 0), 0, 31, 12, 0, 0)); // 31 January next year
    const { clock, sub } = await subscribe(start);

    const feb = addMonths(start, 1, 31);
    expect(day(feb)).toMatch(/-02-(28|29)$/);
    expect(day(await periodEnd(sub))).toBe(day(feb));

    await advanceTo(clock.id, new Date(feb.getTime() + 2 * HOUR * 1000));
    await waitFor("February payment", async () => ((await donationsOf(sub)).length >= 2 ? true : null));
    const mar = addMonths(start, 2, 31);
    expect(day(mar)).toMatch(/-03-31$/);
    expect(day(await periodEnd(sub))).toBe(day(mar));
    expect(day((await subRow(sub)).current_period_end)).toBe(day(mar));
  }, 600_000);
});
