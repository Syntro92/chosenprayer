import "server-only";
import type Stripe from "stripe";
import { AppError } from "../errors";
import { log } from "../logger";
import { mapStripeEvent } from "../providers/payments/stripe";
import { db, type Queryable } from "../db";
import { handlePaymentEvent } from "./giving";

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
