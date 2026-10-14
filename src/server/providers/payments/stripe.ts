import "server-only";
import Stripe from "stripe";
import { safeReceiptUrl } from "@/lib/giving";
import type { CheckoutParams, PaymentEvent, PaymentProvider } from "./types";

/**
 * Stripe adapter. It only translates: our donation <-> Stripe objects, and verified Stripe
 * events -> the same `PaymentEvent`s the mock produces. All business rules stay in
 * services/giving.ts, which is why this file is small.
 *
 * Money moves to the platform's own Stripe account. (Per-channel payouts via Stripe Connect use
 * `channels.stripe_account_id` and are a later, separate step.)
 */

const idOf = (v: string | { id: string } | null | undefined): string | undefined => (typeof v === "string" ? v : v?.id);
const cents = (n: number | null | undefined) => (typeof n === "number" && n > 0 ? n : 0);

export function createStripeProvider(stripe: Stripe): PaymentProvider {
  return {
    name: "stripe",

    async createCheckout(p: CheckoutParams) {
      const currency = p.currency.toLowerCase();
      const metadata = { donation_id: p.donationId, channel_handle: p.channel.handle };

      if (p.frequency === "once") {
        const pi = await stripe.paymentIntents.create(
          {
            amount: p.amountCents,
            currency,
            description: p.description,
            // Cards only (this also covers Apple Pay / Google Pay): no bank debits or buy-now-pay-later,
            // and nothing that redirects, so the donor never leaves the page.
            allowed_payment_method_types: ["card"],
            metadata,
          },
          { idempotencyKey: `donation:${p.donationId}` },
        );
        if (!pi.client_secret) throw new Error("Stripe returned no client secret");
        return { providerPaymentId: pi.id, clientSecret: pi.client_secret };
      }

      // Monthly: a customer + a subscription whose first invoice the donor pays right now.
      const customer = await stripe.customers.create(
        { ...(p.donorEmail ? { email: p.donorEmail } : {}), metadata },
        { idempotencyKey: `donation-customer:${p.donationId}` },
      );
      // Subscription prices must point at a Product; this one is private to this gift.
      const product = await stripe.products.create({ name: p.description.slice(0, 250), metadata }, { idempotencyKey: `donation-product:${p.donationId}` });
      const sub = await stripe.subscriptions.create(
        {
          customer: customer.id,
          items: [
            {
              price_data: {
                currency,
                unit_amount: p.amountCents,
                recurring: { interval: "month" },
                product: product.id,
              },
            },
          ],
          payment_behavior: "default_incomplete",
          payment_settings: { save_default_payment_method: "on_subscription", payment_method_types: ["card"] },
          metadata,
          expand: ["latest_invoice.confirmation_secret", "latest_invoice.payments"],
        },
        { idempotencyKey: `donation-sub:${p.donationId}` },
      );

      const invoice = typeof sub.latest_invoice === "object" ? sub.latest_invoice : null;
      const clientSecret = invoice?.confirmation_secret?.client_secret;
      let paymentIntentId = idOf(invoice?.payments?.data?.map((x) => x.payment?.payment_intent).find(Boolean));
      if (!paymentIntentId && invoice?.id) {
        const list = await stripe.invoicePayments.list({ invoice: invoice.id });
        paymentIntentId = idOf(list.data.map((x) => x.payment?.payment_intent).find(Boolean));
      }
      if (!clientSecret || !paymentIntentId) throw new Error("Stripe returned an incomplete subscription invoice");
      return { providerPaymentId: paymentIntentId, clientSecret, providerCustomerId: customer.id, providerSubscriptionId: sub.id };
    },

    async resumeCheckout(providerPaymentId) {
      const pi = await stripe.paymentIntents.retrieve(providerPaymentId);
      if (!pi.client_secret) throw new Error("Stripe returned no client secret");
      return { clientSecret: pi.client_secret };
    },

    async cancelSubscription(providerSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(providerSubscriptionId);
      } catch (e) {
        // Already canceled on Stripe's side: the goal is reached.
        if ((e as { code?: string }).code === "resource_missing") return;
        throw e;
      }
    },

    async refund(providerPaymentId, amountCents) {
      const refund = await stripe.refunds.create(
        { payment_intent: providerPaymentId, ...(amountCents ? { amount: amountCents } : {}) },
        { idempotencyKey: `refund:${providerPaymentId}:${amountCents ?? "full"}` },
      );
      return { refundId: refund.id };
    },
  };
}

/**
 * Verified Stripe event -> our normalised event, or null for events we don't act on
 * (the endpoint still answers 200 so Stripe doesn't retry them).
 *
 * `payment_intent.succeeded` fires for subscription renewals too; the handler ignores payment
 * intents it has no donation for, and renewals are handled from `invoice.paid` instead.
 */
export async function mapStripeEvent(event: Stripe.Event, stripe: Stripe): Promise<PaymentEvent | null> {
  switch (event.type) {
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      return {
        type: "payment.succeeded",
        eventId: event.id,
        providerPaymentId: pi.id,
        ...(await chargeDetailsOf(stripe, pi.id)),
        providerCustomerId: idOf(pi.customer),
      };
    }
    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      return {
        type: "payment.failed",
        eventId: event.id,
        providerPaymentId: pi.id,
        reason: (pi.last_payment_error?.message ?? "The payment was declined.").slice(0, 300),
      };
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const pi = idOf(charge.payment_intent);
      // A partial refund leaves the gift standing; only a full refund flips it.
      if (!pi || !charge.refunded) return null;
      return { type: "payment.refunded", eventId: event.id, providerPaymentId: pi };
    }
    case "invoice.paid": {
      const inv = event.data.object as Stripe.Invoice;
      if (inv.billing_reason !== "subscription_cycle") return null; // the first invoice is the donation itself
      const subscriptionId = idOf(inv.parent?.subscription_details?.subscription);
      if (!subscriptionId || !inv.amount_paid) return null;
      const list = await stripe.invoicePayments.list({ invoice: inv.id! });
      const pi = idOf(list.data.map((x) => x.payment?.payment_intent).find(Boolean));
      if (!pi) return null;
      const end = inv.lines?.data?.[0]?.period?.end;
      return {
        type: "subscription.renewed",
        eventId: event.id,
        providerSubscriptionId: subscriptionId,
        providerPaymentId: pi,
        amountCents: inv.amount_paid,
        currency: inv.currency.toUpperCase(),
        ...(await chargeDetailsOf(stripe, pi)),
        ...(end ? { periodEnd: new Date(end * 1000).toISOString() } : {}),
      };
    }
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      if (inv.billing_reason !== "subscription_cycle") return null;
      const subscriptionId = idOf(inv.parent?.subscription_details?.subscription);
      return subscriptionId ? { type: "subscription.past_due", eventId: event.id, providerSubscriptionId: subscriptionId } : null;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      return { type: "subscription.canceled", eventId: event.id, providerSubscriptionId: sub.id };
    }
    default:
      return null;
  }
}

/**
 * Stripe's processing fee and the hosted receipt page for a payment. The balance transaction (which
 * holds the fee) can show up a moment AFTER the payment event, so look a few times. Missing details
 * are never fatal: they are informational, so an unknown fee records 0 and a missing link is omitted.
 */
export async function chargeDetailsOf(
  stripe: Stripe,
  paymentIntentId: string,
  opts: { attempts?: number; delayMs?: number } = {},
): Promise<{ feeCents: number; receiptUrl?: string }> {
  const attempts = opts.attempts ?? 4;
  const delayMs = opts.delayMs ?? 800;
  let receiptUrl: string | undefined;
  for (let i = 0; i < attempts; i++) {
    try {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge.balance_transaction"] });
      const charge = typeof pi.latest_charge === "object" ? pi.latest_charge : null;
      if (charge?.receipt_url) receiptUrl = safeReceiptUrl(charge.receipt_url) ?? receiptUrl;
      const bt = charge && typeof charge.balance_transaction === "object" ? charge.balance_transaction : null;
      if (bt) return { feeCents: cents(bt.fee), ...(receiptUrl ? { receiptUrl } : {}) };
    } catch {
      // try again
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return { feeCents: 0, ...(receiptUrl ? { receiptUrl } : {}) };
}

/** Just the fee (see chargeDetailsOf). */
export async function feeOf(stripe: Stripe, paymentIntentId: string, opts: { attempts?: number; delayMs?: number } = {}): Promise<number> {
  return (await chargeDetailsOf(stripe, paymentIntentId, opts)).feeCents;
}
