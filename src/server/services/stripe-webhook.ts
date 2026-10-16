import "server-only";
import type Stripe from "stripe";
import { AppError } from "../errors";
import { log } from "../logger";
import { donationLookupSchema } from "@/lib/schemas/giving";
import type { Actor } from "../auth/policy";
import { chargeDetailsOf, mapStripeEvent } from "../providers/payments/stripe";
import { db, type Queryable } from "../db";
import { handlePaymentEvent, loadAuthorizedDonation } from "./giving";

export interface WebhookResult {
  handled: boolean;
  duplicate: boolean;
  /** Channel handles whose cached public pages must be refreshed by the caller. */
  channelHandles: string[];
}

/**
 * Verifies and applies one Stripe webhook delivery.
 *  - bad/missing signature, or a body that isn't what Stripe signed -> VALIDATION (HTTP 400)
 *  - events we don't act on -> handled:false (HTTP 200: Stripe must not retry them)
 *  - anything that fails while applying throws, so the caller answers 500 and Stripe retries
 */
export async function processStripeWebhook(
  input: { body: string; signature: string | null; secret: string },
  stripe: Stripe,
  conn: Queryable = db,
): Promise<WebhookResult> {
  if (!input.signature) throw new AppError("VALIDATION", "Missing signature.");
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(input.body, input.signature, input.secret);
  } catch {
    throw new AppError("VALIDATION", "Invalid signature.");
  }

  const mapped = await mapStripeEvent(event, stripe);
  if (!mapped) return { handled: false, duplicate: false, channelHandles: [] };

  const outcome = await handlePaymentEvent(mapped, "stripe", conn);
  if (outcome.ignored) log.info("stripe event matched nothing we know", { type: event.type, eventId: event.id });
  return { handled: !outcome.ignored, duplicate: outcome.duplicate, channelHandles: outcome.channelHandles };
}

/**
 * Safety net for a webhook that is late or never arrives (e.g. `stripe listen` not running, or the
 * endpoint not configured). If the donation is still pending, ask Stripe directly and, when the
 * payment really succeeded, apply the same event the webhook would. Idempotent with the real
 * webhook: whichever comes second finds the donation already settled and does nothing.
 * Returns the channel handles whose cached pages need refreshing.
 */
export async function reconcileStripeDonation(actor: Actor | null, raw: unknown, stripe: Stripe, conn: Queryable = db): Promise<string[]> {
  const { donationId, token } = donationLookupSchema.parse(raw);
  const d = await loadAuthorizedDonation(actor, donationId, token, conn);
  if (d.status !== "pending" || !d.provider_payment_id) return [];
  const pi = await stripe.paymentIntents.retrieve(d.provider_payment_id);
  if (pi.status !== "succeeded") return [];
  const outcome = await handlePaymentEvent(
    {
      type: "payment.succeeded",
      eventId: `reconcile:${pi.id}`,
      providerPaymentId: pi.id,
      ...(await chargeDetailsOf(stripe, pi.id, { attempts: 2, delayMs: 500 })),
      providerCustomerId: typeof pi.customer === "string" ? pi.customer : pi.customer?.id,
    },
    "stripe",
    conn,
  );
  return outcome.channelHandles;
}
