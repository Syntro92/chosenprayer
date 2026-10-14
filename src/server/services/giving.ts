import "server-only";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { formatMoney, safeReceiptUrl, GIVING_LIMITS } from "@/lib/giving";
import { donationLookupSchema, startDonationSchema } from "@/lib/schemas/giving";
import { uuidSchema } from "@/lib/schemas/community";
import { hasRole, requireMember, requireRole, type Actor } from "../auth/policy";
import { db, inTransaction, one, rows, type Queryable } from "../db";
import { getEnv } from "../env";
import { AppError } from "../errors";
import { errorFields, log } from "../logger";
import { clampLimit, decodeCursor, toPage, type Page } from "../pagination";
import { getPaymentProvider, getPaymentsMode, type PaymentEvent, type PaymentProvider } from "../providers/payments";
import { enforceRateLimit } from "../rate-limit";
import { z } from "zod";
import { audit } from "./audit";
import { ISO_US, UUID_RE } from "./community-shared";
import { enqueueEmail, flushOutboxSoon } from "./email";
import { notify } from "./notifications";

/* ------------------------------------------------------------------------ */
/* Config                                                                    */
/* ------------------------------------------------------------------------ */

export interface GivingConfig {
  /** Which provider is wired in. "mock" means test mode: no real money moves. */
  provider: "mock" | "stripe";
  /** True for the mock and for Stripe sandbox keys: no real money moves. */
  testMode: boolean;
  /** Stripe's public key for the card form (null for the mock). Safe to send to browsers. */
  publishableKey: string | null;
  /** False when giving is switched off or no usable payment provider is configured. */
  available: boolean;
  recurring: boolean;
  minAmount: number;
  maxAmount: number;
}

export async function getGivingConfig(): Promise<GivingConfig> {
  let usable = true;
  try {
    getPaymentProvider();
  } catch {
    usable = false;
  }
  const mode = getPaymentsMode();
  return {
    provider: mode.provider,
    testMode: mode.testMode,
    publishableKey: mode.provider === "stripe" ? (getEnv().STRIPE_PUBLISHABLE_KEY ?? null) : null,
    available: usable,
    recurring: true,
    minAmount: GIVING_LIMITS.minAmount,
    maxAmount: GIVING_LIMITS.maxAmount,
  };
}

/* ------------------------------------------------------------------------ */
/* Looking up a donation (shared with blessings)                             */
/* ------------------------------------------------------------------------ */

export interface DonationRow {
  id: string;
  status: "pending" | "succeeded" | "failed" | "refunded" | "canceled";
  amount_cents: number;
  fee_cents: number;
  currency: string;
  frequency: "once" | "monthly";
  donor_id: string | null;
  donor_name: string | null;
  donor_email: string | null;
  public_token: string;
  provider_payment_id: string | null;
  provider_subscription_id: string | null;
  subscription_id: string | null;
  channel_id: string;
  channel_handle: string;
  channel_name: string;
  owner_id: string | null;
  has_blessing: boolean;
  channel_show_blessings: boolean;
}

const DONATION_SQL = `
  select d.id, d.status, d.amount_cents, d.fee_cents, d.currency, d.frequency, d.donor_id, d.donor_name,
         d.donor_email::text as donor_email, d.public_token, d.provider_payment_id, d.provider_subscription_id,
         d.subscription_id, d.channel_id, c.handle::text as channel_handle, c.name as channel_name, c.owner_id, c.show_blessings as channel_show_blessings,
         exists (select 1 from public.blessings b where b.donation_id = d.id) as has_blessing
  from public.donations d join public.channels c on c.id = d.channel_id`;

function tokenMatches(given: string | undefined, actual: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Loads a donation the caller is allowed to see: the donor (signed in), anyone holding the
 * secret token from startDonation (guests), or an admin. Anything else is NOT_FOUND, so
 * donation ids can't be probed.
 */
export async function loadAuthorizedDonation(
  actor: Actor | null,
  donationId: string,
  token: string | undefined,
  conn: Queryable,
): Promise<DonationRow> {
  const id = uuidSchema.safeParse(donationId);
  if (!id.success) throw new AppError("NOT_FOUND", "Donation not found.");
  const d = await one<DonationRow>(`${DONATION_SQL} where d.id = $1`, [id.data], conn);
  const allowed =
    !!d &&
    (tokenMatches(token, d.public_token) ||
      (!!actor && actor.status === "active" && d.donor_id !== null && d.donor_id === actor.userId) ||
      hasRole(actor, "admin"));
  if (!d || !allowed) throw new AppError("NOT_FOUND", "Donation not found.");
  return d;
}

/* ------------------------------------------------------------------------ */
/* Starting a donation                                                       */
/* ------------------------------------------------------------------------ */

export interface StartedDonation {
  donationId: string;
  /** Secret for this donation. Guests use it to check status and leave a blessing. */
  token: string;
  provider: "mock" | "stripe";
  /** What the browser needs to complete payment. Null if the donation is already settled. */
  clientSecret: string | null;
  status: DonationRow["status"];
  amountCents: number;
  currency: string;
  frequency: "once" | "monthly";
}

/**
 * Creates a PENDING donation and asks the provider for a checkout. It does not mark anything
 * paid: only a verified provider event does that (handlePaymentEvent). Safe to retry with the
 * same idempotency key: you always get the same donation back.
 */
export async function startDonation(
  actor: Actor | null,
  raw: unknown,
  ctx: { ip: string },
  conn: Queryable = db,
  provider?: PaymentProvider,
): Promise<StartedDonation> {
  const input = startDonationSchema.parse(raw);
  if (actor && actor.status !== "active") throw new AppError("FORBIDDEN", "Your account is suspended.");

  const pay = provider ?? getPaymentProvider();
  await enforceRateLimit("donation", actor?.userId ?? ctx.ip, conn);

  // A retry with the same key returns the same donation (never a second charge).
  const existing = await one<DonationRow>(`${DONATION_SQL} where d.idempotency_key = $1`, [input.idempotencyKey], conn);
  if (existing) return resumeExisting(existing, actor, input, pay);

  const channel = await one<{ id: string; handle: string; name: string; currency: string; stripe_account_id: string | null }>(
    "select id, handle::text as handle, name, currency, stripe_account_id from public.channels where handle = $1 and status = 'active'",
    [input.channelHandle],
    conn,
  );
  if (!channel) throw new AppError("NOT_FOUND", "Channel not found.");

  let email: string | null = input.donorEmail ?? null;
  let name: string | null = input.donorName || null;
  if (actor) {
    email = (await one<{ email: string }>("select email from auth.users where id = $1", [actor.userId], conn))?.email ?? null;
    name = actor.displayName;
  } else if (!email) {
    throw new AppError("VALIDATION", "Enter your email so we can send a receipt.", { fields: { donorEmail: "Enter your email for the receipt" } });
  }

  const amountCents = input.amount * 100;
  try {
    return await inTransaction(conn, async (c) => {
      const { rows: [d] } = await c.query<{ id: string; public_token: string }>(
        `insert into public.donations
           (channel_id, donor_id, donor_name, donor_email, amount_cents, currency, frequency, source, provider, idempotency_key)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id, public_token`,
        [channel.id, actor?.userId ?? null, name, email, amountCents, channel.currency, input.frequency, input.source, pay.name, input.idempotencyKey],
      );
      const session = await pay.createCheckout({
        donationId: d.id,
        channel: { id: channel.id, handle: channel.handle, name: channel.name, stripeAccountId: channel.stripe_account_id },
        amountCents,
        currency: channel.currency,
        frequency: input.frequency,
        donorEmail: email,
        description: `${input.frequency === "monthly" ? "Monthly support" : "Support"} for ${channel.name}`,
      });
      await c.query(
        "update public.donations set provider_payment_id = $2, provider_customer_id = $3, provider_subscription_id = $4 where id = $1",
        [d.id, session.providerPaymentId, session.providerCustomerId ?? null, session.providerSubscriptionId ?? null],
      );
      return {
        donationId: d.id,
        token: d.public_token,
        provider: pay.name,
        clientSecret: session.clientSecret,
        status: "pending" as const,
        amountCents,
        currency: channel.currency,
        frequency: input.frequency,
      };
    });
  } catch (e) {
    // Two requests with the same key at once: the loser's insert hits the unique key. Return the winner's.
    if ((e as { code?: string }).code === "23505" && (e as { constraint?: string }).constraint === "donations_idempotency_key_key") {
      const winner = await one<DonationRow>(`${DONATION_SQL} where d.idempotency_key = $1`, [input.idempotencyKey], conn);
      if (winner) return resumeExisting(winner, actor, input, pay);
    }
    if (e instanceof AppError) throw e;
    if ((e as { code?: string }).code?.startsWith?.("23")) throw e; // constraint problems map through toAppError
    log.error("starting a donation failed at the payment provider", errorFields(e));
    throw new AppError("PAYMENT_FAILED", "We couldn't start your payment. You haven't been charged. Please try again.", { cause: e });
  }
}

async function resumeExisting(
  d: DonationRow,
  actor: Actor | null,
  input: z.output<typeof startDonationSchema>,
  pay: PaymentProvider,
): Promise<StartedDonation> {
  // The key may only be reused by the same person for the same gift.
  const sameGift = d.channel_handle === input.channelHandle && d.amount_cents === input.amount * 100 && d.frequency === input.frequency;
  const sameDonor = d.donor_id === (actor?.userId ?? null);
  if (!sameGift || !sameDonor) throw new AppError("CONFLICT", "That request was already used for a different gift. Please try again.");
  const clientSecret =
    d.status === "pending" && d.provider_payment_id ? (await pay.resumeCheckout(d.provider_payment_id)).clientSecret : null;
  return {
    donationId: d.id,
    token: d.public_token,
    provider: pay.name,
    clientSecret,
    status: d.status,
    amountCents: d.amount_cents,
    currency: d.currency,
    frequency: d.frequency,
  };
}

/* ------------------------------------------------------------------------ */
/* Handling provider events                                                  */
/* ------------------------------------------------------------------------ */

export interface EventOutcome {
  /** True when this exact event was already processed (providers retry): nothing was changed. */
  duplicate: boolean;
  /** True when the event doesn't match anything we know (logged, not an error). */
  ignored: boolean;
  /** Channel handles whose public pages should be refreshed (the caller revalidates caches). */
  channelHandles: string[];
}

const money = (cents: number, currency: string) => formatMoney(cents, currency);

/**
 * The single place a donation changes state, whether the event comes from a verified Stripe
 * webhook or from the mock provider. Idempotent by (provider, eventId): replaying an event does
 * nothing. The whole thing, including its receipt email and notifications, is one transaction.
 */
export async function handlePaymentEvent(
  event: PaymentEvent,
  providerName: "mock" | "stripe",
  conn: Queryable = db,
): Promise<EventOutcome> {
  const outcome = await inTransaction(conn, async (c) => {
    const logged = await c.query(
      `insert into public.payment_events (provider, event_id, type, payload) values ($1, $2, $3, $4)
       on conflict (provider, event_id) do nothing`,
      [providerName, event.eventId, event.type, JSON.stringify(event)],
    );
    if (!logged.rowCount) return { duplicate: true, ignored: false, channelHandles: [] };

    const handles = new Set<string>();
    let ignored = false;

    const receipt = async (
      d: { id: string; donor_email: string | null; channel_name: string; amount_cents: number; currency: string; frequency: string },
      receiptUrl?: string | null,
    ) => {
      if (d.donor_email) {
        await enqueueEmail(c, {
          to: d.donor_email,
          template: "donation_receipt",
          payload: {
            donationId: d.id,
            channelName: d.channel_name,
            amountCents: d.amount_cents,
            currency: d.currency,
            frequency: d.frequency,
            paidAt: new Date().toISOString(),
            ...(safeReceiptUrl(receiptUrl) ? { receiptUrl: safeReceiptUrl(receiptUrl) } : {}),
          },
        });
      }
    };
    const tellOwner = async (d: { owner_id: string | null; donor_id: string | null; channel_name: string; channel_handle: string; amount_cents: number; currency: string }) => {
      if (!d.owner_id) return;
      // Admin > Settings > "Notify channel owners about new donations"
      const on = await one<{ on: boolean }>("select notify_on_donation as on from public.site_settings where id", [], c);
      if (on && !on.on) return;
      await notify(c, {
        userId: d.owner_id,
        actorId: d.donor_id,
        type: "donation",
        text: `A supporter gave ${money(d.amount_cents, d.currency)} to ${d.channel_name}`,
        href: `/channels/${d.channel_handle}`,
      });
    };

    switch (event.type) {
      case "payment.succeeded": {
        const d = await one<DonationRow>(`${DONATION_SQL} where d.provider_payment_id = $1 for update of d`, [event.providerPaymentId], c);
        if (!d) {
          ignored = true;
          break;
        }
        // Already settled, or refunded before this (out-of-order) event arrived: nothing to do.
        if (d.status === "succeeded" || d.status === "refunded") break;

        const fee = Math.min(Math.max(event.feeCents ?? 0, 0), d.amount_cents);
        await c.query(
          `update public.donations set status = 'succeeded', fee_cents = $2, provider_customer_id = coalesce($3, provider_customer_id),
                  receipt_url = coalesce($4, receipt_url), failure_reason = null where id = $1`,
          [d.id, fee, event.providerCustomerId ?? null, safeReceiptUrl(event.receiptUrl)],
        );
        if (d.frequency === "monthly" && d.provider_subscription_id) {
          const { rows: [sub] } = await c.query<{ id: string }>(
            `insert into public.subscriptions
               (channel_id, donor_id, donor_email, amount_cents, currency, status, provider, provider_subscription_id, provider_customer_id, current_period_end)
             values ($1, $2, $3, $4, $5, 'active', $6, $7, $8, now() + interval '1 month')
             on conflict (provider_subscription_id) do update set status = 'active'
             returning id`,
            [d.channel_id, d.donor_id, d.donor_email, d.amount_cents, d.currency, providerName, d.provider_subscription_id, event.providerCustomerId ?? null],
          );
          await c.query("update public.donations set subscription_id = $2 where id = $1", [d.id, sub.id]);
        }
        await receipt(d, event.receiptUrl);
        await tellOwner(d);
        handles.add(d.channel_handle);
        break;
      }

      case "payment.failed": {
        const d = await one<DonationRow>(`${DONATION_SQL} where d.provider_payment_id = $1 for update of d`, [event.providerPaymentId], c);
        if (!d) {
          ignored = true;
          break;
        }
        if (d.status === "pending") {
          await c.query("update public.donations set status = 'failed', failure_reason = left($2, 300) where id = $1", [d.id, event.reason]);
        }
        break;
      }

      case "payment.refunded": {
        const d = await one<DonationRow>(`${DONATION_SQL} where d.provider_payment_id = $1 for update of d`, [event.providerPaymentId], c);
        if (!d) {
          ignored = true;
          break;
        }
        if (d.status === "succeeded") {
          await markRefunded(c, d, true);
          handles.add(d.channel_handle);
        }
        break;
      }

      case "subscription.renewed": {
        const sub = await one<{
          id: string; channel_id: string; donor_id: string | null; donor_email: string | null; status: string;
          channel_handle: string; channel_name: string; owner_id: string | null; channel_status: string;
        }>(
          `select s.id, s.channel_id, s.donor_id, s.donor_email::text as donor_email, s.status,
                  c.handle::text as channel_handle, c.name as channel_name, c.owner_id, c.status as channel_status
           from public.subscriptions s join public.channels c on c.id = s.channel_id
           where s.provider_subscription_id = $1 for update of s`,
          [event.providerSubscriptionId],
          c,
        );
        if (!sub || sub.status === "canceled") {
          ignored = true;
          break;
        }
        if (sub.channel_status !== "active") {
          log.warn("subscription payment for a channel that is no longer active", { subscriptionId: sub.id });
          ignored = true;
          break;
        }
        const fee = Math.min(Math.max(event.feeCents ?? 0, 0), event.amountCents);
        const { rows: [created] } = await c.query<{ id: string }>(
          `insert into public.donations
             (channel_id, donor_id, subscription_id, donor_email, amount_cents, fee_cents, currency, frequency, status,
              provider, provider_payment_id, provider_subscription_id, receipt_url)
           values ($1, $2, $3, $4, $5, $6, $7, 'monthly', 'succeeded', $8, $9, $10, $11)
           on conflict (provider_payment_id) do nothing
           returning id`,
          [sub.channel_id, sub.donor_id, sub.id, sub.donor_email, event.amountCents, fee, event.currency, providerName, event.providerPaymentId, event.providerSubscriptionId, safeReceiptUrl(event.receiptUrl)],
        );
        if (!created) break; // that cycle was already recorded
        await c.query(
          `update public.subscriptions set status = 'active', current_period_end = coalesce($2::timestamptz, current_period_end + interval '1 month') where id = $1`,
          [sub.id, event.periodEnd ?? null],
        );
        const info = { id: created.id, donor_email: sub.donor_email, channel_name: sub.channel_name, amount_cents: event.amountCents, currency: event.currency, frequency: "monthly" };
        await receipt(info, event.receiptUrl);
        await tellOwner({ owner_id: sub.owner_id, donor_id: sub.donor_id, channel_name: sub.channel_name, channel_handle: sub.channel_handle, amount_cents: event.amountCents, currency: event.currency });
        handles.add(sub.channel_handle);
        break;
      }

      case "subscription.past_due": {
        const r = await c.query("update public.subscriptions set status = 'past_due' where provider_subscription_id = $1 and status = 'active'", [event.providerSubscriptionId]);
        ignored = !r.rowCount;
        break;
      }

      case "subscription.canceled": {
        const sub = await one<{ id: string; status: string; donor_email: string | null; amount_cents: number; currency: string; channel_name: string }>(
          `select s.id, s.status, s.donor_email::text as donor_email, s.amount_cents, s.currency, c.name as channel_name
           from public.subscriptions s join public.channels c on c.id = s.channel_id
           where s.provider_subscription_id = $1 for update of s`,
          [event.providerSubscriptionId],
          c,
        );
        if (!sub) {
          ignored = true;
          break;
        }
        if (sub.status !== "canceled") {
          await c.query("update public.subscriptions set status = 'canceled', canceled_at = now() where id = $1", [sub.id]);
          if (sub.donor_email) {
            await enqueueEmail(c, {
              to: sub.donor_email,
              template: "subscription_canceled",
              payload: { channelName: sub.channel_name, amountCents: sub.amount_cents, currency: sub.currency },
            });
          }
        }
        break;
      }
    }

    await c.query("update public.payment_events set processed_at = now() where provider = $1 and event_id = $2", [providerName, event.eventId]);
    return { duplicate: false, ignored, channelHandles: [...handles] };
  });
  await flushOutboxSoon(conn);
  return outcome;
}

async function markRefunded(c: Queryable, d: DonationRow, sendEmail: boolean) {
  await c.query("update public.donations set status = 'refunded' where id = $1", [d.id]);
  if (sendEmail && d.donor_email) {
    await enqueueEmail(c, {
      to: d.donor_email,
      template: "donation_refunded",
      payload: { channelName: d.channel_name, amountCents: d.amount_cents, currency: d.currency },
    });
  }
}

/* ------------------------------------------------------------------------ */
/* Test mode: simulate the provider                                          */
/* ------------------------------------------------------------------------ */

export type MockOutcome = "succeeded" | "failed" | "refunded" | "renew" | "past_due" | "cancel_subscription";

/**
 * Test mode only. Plays the part of the payment provider by feeding a normalised event into the
 * REAL handler. Refuses (as if it didn't exist) unless the mock provider is configured and this
 * isn't production. Ownership rules are the same as reading the donation: you need its token
 * (or to be the donor), so nobody can "pay" someone else's donation.
 */
export async function simulateMockPayment(
  actor: Actor | null,
  raw: unknown,
  conn: Queryable = db,
): Promise<EventOutcome & { status: DonationRow["status"] }> {
  const env = getEnv();
  if (env.PAYMENTS_PROVIDER !== "mock" || env.NODE_ENV === "production") throw new AppError("NOT_FOUND", "Not found.");

  const { donationId, token } = donationLookupSchema.parse(raw);
  const { outcome } = z
    .object({ outcome: z.enum(["succeeded", "failed", "refunded", "renew", "past_due", "cancel_subscription"]) })
    .parse(raw);
  const d = await loadAuthorizedDonation(actor, donationId, token, conn);
  if (!d.provider_payment_id) throw new AppError("CONFLICT", "That donation has no payment to simulate.");

  const eventId = `evt_mock_${randomUUID()}`;
  const needsSub = () => {
    if (!d.provider_subscription_id) throw new AppError("VALIDATION", "That donation isn't a monthly gift.");
    return d.provider_subscription_id;
  };
  const events: Record<MockOutcome, () => PaymentEvent> = {
    succeeded: () => ({ type: "payment.succeeded", eventId, providerPaymentId: d.provider_payment_id!, feeCents: Math.round(d.amount_cents * 0.029) + 30 }),
    failed: () => ({ type: "payment.failed", eventId, providerPaymentId: d.provider_payment_id!, reason: "Your card was declined (test mode)." }),
    refunded: () => ({ type: "payment.refunded", eventId, providerPaymentId: d.provider_payment_id! }),
    renew: () => ({
      type: "subscription.renewed",
      eventId,
      providerSubscriptionId: needsSub(),
      providerPaymentId: `mock_pi_${randomUUID()}`,
      amountCents: d.amount_cents,
      currency: d.currency,
      feeCents: Math.round(d.amount_cents * 0.029) + 30,
    }),
    past_due: () => ({ type: "subscription.past_due", eventId, providerSubscriptionId: needsSub() }),
    cancel_subscription: () => ({ type: "subscription.canceled", eventId, providerSubscriptionId: needsSub() }),
  };

  const outcomeResult = await handlePaymentEvent(events[outcome as MockOutcome](), "mock", conn);
  const after = await one<{ status: DonationRow["status"] }>("select status from public.donations where id = $1", [d.id], conn);
  return { ...outcomeResult, status: after!.status };
}

/* ------------------------------------------------------------------------ */
/* Reading                                                                   */
/* ------------------------------------------------------------------------ */

export interface DonationStatus {
  id: string;
  status: DonationRow["status"];
  amountCents: number;
  currency: string;
  frequency: "once" | "monthly";
  channel: { handle: string; name: string };
  /** True once the gift is confirmed and no blessing has been left for it yet. */
  canLeaveBlessing: boolean;
  hasBlessing: boolean;
}

/** For the success page: poll this until `status` is "succeeded". */
export async function getDonationStatus(actor: Actor | null, raw: unknown, conn: Queryable = db): Promise<DonationStatus> {
  const { donationId, token } = donationLookupSchema.parse(raw);
  const d = await loadAuthorizedDonation(actor, donationId, token, conn);
  return {
    id: d.id,
    status: d.status,
    amountCents: d.amount_cents,
    currency: d.currency,
    frequency: d.frequency,
    channel: { handle: d.channel_handle, name: d.channel_name },
    canLeaveBlessing: d.status === "succeeded" && !d.has_blessing,
    hasBlessing: d.has_blessing,
  };
}

export interface MyDonation {
  id: string;
  status: DonationRow["status"];
  amountCents: number;
  currency: string;
  frequency: "once" | "monthly";
  createdAt: string;
  channel: { handle: string; name: string };
  /** Provider-hosted receipt page (Stripe), when there is one. */
  receiptUrl: string | null;
}

/** The signed-in member's own giving history, newest first. */
export async function listMyDonations(
  actor: Actor | null,
  opts: { cursor?: string; limit?: number } = {},
  conn: Queryable = db,
): Promise<Page<MyDonation>> {
  const a = requireMember(actor);
  const limit = clampLimit(opts.limit, 20, 50);
  const cursor = decodeCursor(opts.cursor);
  const params: unknown[] = [a.userId];
  let after = "";
  if (cursor) {
    if (typeof cursor.k !== "string" || !UUID_RE.test(cursor.id) || Number.isNaN(Date.parse(cursor.k))) {
      throw new AppError("VALIDATION", "Invalid cursor.", { fields: { cursor: "Invalid cursor" } });
    }
    params.push(cursor.k, cursor.id);
    after = "and (d.created_at, d.id) < ($2::timestamptz, $3::uuid)";
  }
  params.push(limit + 1);
  const fetched = await rows<{
    id: string; status: DonationRow["status"]; amount_cents: number; currency: string; frequency: "once" | "monthly";
    created_raw: string; handle: string; name: string; receipt_url: string | null;
  }>(
    `select d.id, d.status, d.amount_cents, d.currency, d.frequency, d.receipt_url,
            to_char(d.created_at at time zone 'UTC', ${ISO_US}) as created_raw, c.handle::text as handle, c.name
     from public.donations d join public.channels c on c.id = d.channel_id
     where d.donor_id = $1 and d.status in ('succeeded', 'refunded') ${after}
     order by d.created_at desc, d.id desc limit $${params.length}`,
    params,
    conn,
  );
  const page = toPage(fetched, limit, (r) => ({ k: r.created_raw, id: r.id }));
  return {
    nextCursor: page.nextCursor,
    items: page.items.map((r) => ({
      id: r.id,
      status: r.status,
      amountCents: r.amount_cents,
      currency: r.currency,
      frequency: r.frequency,
      createdAt: r.created_raw,
      channel: { handle: r.handle, name: r.name },
      receiptUrl: safeReceiptUrl(r.receipt_url),
    })),
  };
}

export interface MySubscription {
  id: string;
  status: "active" | "past_due" | "paused" | "canceled";
  amountCents: number;
  currency: string;
  currentPeriodEnd: string | null;
  channel: { handle: string; name: string };
}

export async function listMySubscriptions(actor: Actor | null, conn: Queryable = db): Promise<MySubscription[]> {
  const a = requireMember(actor);
  const list = await rows<{
    id: string; status: MySubscription["status"]; amount_cents: number; currency: string; period_end: string | null; handle: string; name: string;
  }>(
    `select s.id, s.status, s.amount_cents, s.currency,
            to_char(s.current_period_end at time zone 'UTC', ${ISO_US}) as period_end, c.handle::text as handle, c.name
     from public.subscriptions s join public.channels c on c.id = s.channel_id
     where s.donor_id = $1 order by (s.status = 'canceled'), s.started_at desc`,
    [a.userId],
    conn,
  );
  return list.map((r) => ({
    id: r.id,
    status: r.status,
    amountCents: r.amount_cents,
    currency: r.currency,
    currentPeriodEnd: r.period_end,
    channel: { handle: r.handle, name: r.name },
  }));
}

/* ------------------------------------------------------------------------ */
/* Changing things                                                           */
/* ------------------------------------------------------------------------ */

/** Stop your own monthly support. Idempotent: canceling twice is fine. */
export async function cancelMySubscription(
  actor: Actor | null,
  rawId: string,
  conn: Queryable = db,
  provider?: PaymentProvider,
): Promise<void> {
  const a = requireMember(actor);
  const id = uuidSchema.safeParse(rawId);
  if (!id.success) throw new AppError("NOT_FOUND", "Subscription not found.");
  const pay = provider ?? getPaymentProvider();

  await inTransaction(conn, async (c) => {
    const s = await one<{ status: string; provider_subscription_id: string | null; donor_email: string | null; amount_cents: number; currency: string; channel_name: string }>(
      `select s.status, s.provider_subscription_id, s.donor_email::text as donor_email, s.amount_cents, s.currency, c.name as channel_name
       from public.subscriptions s join public.channels c on c.id = s.channel_id
       where s.id = $1 and s.donor_id = $2 for update of s`,
      [id.data, a.userId],
      c,
    );
    if (!s) throw new AppError("NOT_FOUND", "Subscription not found.");
    if (s.status === "canceled") return;
    if (s.provider_subscription_id) await pay.cancelSubscription(s.provider_subscription_id); // if this throws, nothing below is saved
    await c.query("update public.subscriptions set status = 'canceled', canceled_at = now() where id = $1", [id.data]);
    if (s.donor_email) {
      await enqueueEmail(c, {
        to: s.donor_email,
        template: "subscription_canceled",
        payload: { channelName: s.channel_name, amountCents: s.amount_cents, currency: s.currency },
      });
    }
  });
  await flushOutboxSoon(conn);
}

/**
 * Admin refund. The provider is asked first; only if it succeeds is the donation marked refunded,
 * the donor emailed and the action audited, all in one transaction.
 */
export async function adminRefund(
  actor: Actor | null,
  rawId: string,
  raw: unknown,
  conn: Queryable = db,
  provider?: PaymentProvider,
): Promise<{ channelHandle: string }> {
  const a = requireRole(actor, "admin");
  const id = uuidSchema.safeParse(rawId);
  if (!id.success) throw new AppError("NOT_FOUND", "Donation not found.");
  const { reason } = z.object({ reason: z.string().trim().min(1, "Please give a reason.").max(300) }).parse(raw);
  const pay = provider ?? getPaymentProvider();

  const result = await inTransaction(conn, async (c) => {
    const d = await one<DonationRow>(`${DONATION_SQL} where d.id = $1 for update of d`, [id.data], c);
    if (!d) throw new AppError("NOT_FOUND", "Donation not found.");
    if (d.status === "refunded") throw new AppError("CONFLICT", "That donation has already been refunded.");
    if (d.status !== "succeeded" || !d.provider_payment_id) throw new AppError("CONFLICT", "Only completed donations can be refunded.");

    await pay.refund(d.provider_payment_id);
    await markRefunded(c, d, true);
    await audit(c, {
      actorId: a.userId,
      action: "donation.refund",
      entityType: "donation",
      entityId: d.id,
      metadata: { reason, amountCents: d.amount_cents, currency: d.currency, channel: d.channel_handle },
    });
    return { channelHandle: d.channel_handle };
  });
  await flushOutboxSoon(conn);
  return result;
}

/** Cron: a checkout nobody finished within 24 hours is abandoned. Returns how many were closed. */
export async function sweepStaleDonations(conn: Queryable = db): Promise<number> {
  const r = await conn.query(
    "update public.donations set status = 'canceled' where status = 'pending' and created_at < now() - interval '24 hours'",
  );
  return r.rowCount ?? 0;
}
