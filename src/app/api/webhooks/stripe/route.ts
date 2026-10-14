import { revalidateTag } from "next/cache";
import { after } from "next/server";
import { getEnv } from "@/server/env";
import { AppError } from "@/server/errors";
import { handler, json } from "@/server/http";
import { errorFields, log } from "@/server/logger";
import { getStripeClient } from "@/server/providers/payments";
import { processOutbox } from "@/server/services/email";
import { processStripeWebhook } from "@/server/services/stripe-webhook";

/**
 * Stripe -> us. The ONLY way a card payment becomes "succeeded", "failed" or "refunded" in our
 * database, and therefore in the admin dashboard, transactions and totals.
 *
 * The signature is checked on the RAW body. Handled and ignored events answer 200 (Stripe stops
 * retrying); a failure while applying answers 500 so Stripe retries for up to 3 days.
 */
export const POST = handler(
  async (req) => {
    const env = getEnv();
    if (env.PAYMENTS_PROVIDER !== "stripe" || !env.STRIPE_WEBHOOK_SECRET) throw new AppError("NOT_FOUND", "Not found.");
    const result = await processStripeWebhook(
      { body: await req.text(), signature: req.headers.get("stripe-signature"), secret: env.STRIPE_WEBHOOK_SECRET },
      getStripeClient(),
    );
    for (const h of result.channelHandles) revalidateTag(`channel:${h.toLowerCase()}`, "max");
    // Send the receipt right away (after the response, so Stripe isn't kept waiting). The scheduled
    // /api/cron/email job is only the safety net for retries.
    if (result.handled && !result.duplicate) {
      after(async () => {
        try {
          await processOutbox({ limit: 10 });
        } catch (e) {
          log.warn("sending receipts after a webhook failed; the scheduled job will retry", errorFields(e));
        }
      });
    }
    return json({ received: true, handled: result.handled, duplicate: result.duplicate });
  },
  { csrf: false },
);
