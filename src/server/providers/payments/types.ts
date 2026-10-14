/**
 * What the app needs from a payment provider. Stripe (later) and the built-in mock both
 * implement this, and BOTH feed the same `PaymentEvent`s into handlePaymentEvent, so the
 * business logic is exercised identically before and after Stripe exists.
 */

export interface CheckoutParams {
  donationId: string;
  channel: { id: string; handle: string; name: string; stripeAccountId: string | null };
  amountCents: number;
  currency: string;
  frequency: "once" | "monthly";
  donorEmail: string | null;
  description: string;
}

export interface CheckoutSession {
  providerPaymentId: string;
  /** What the browser needs to complete payment (a Stripe client secret, or a mock token). */
  clientSecret: string;
  providerCustomerId?: string;
  /** Present for monthly gifts: the provider-side subscription this payment starts. */
  providerSubscriptionId?: string;
}

/** Provider events, already verified and normalised. `eventId` makes handling idempotent. */
export type PaymentEvent =
  | { type: "payment.succeeded"; eventId: string; providerPaymentId: string; feeCents?: number; providerCustomerId?: string; receiptUrl?: string }
  | { type: "payment.failed"; eventId: string; providerPaymentId: string; reason: string }
  | { type: "payment.refunded"; eventId: string; providerPaymentId: string }
  | {
      type: "subscription.renewed"; // a later monthly cycle was paid
      eventId: string;
      providerSubscriptionId: string;
      providerPaymentId: string;
      amountCents: number;
      currency: string;
      feeCents?: number;
      periodEnd?: string; // ISO
      receiptUrl?: string;
    }
  | { type: "subscription.past_due"; eventId: string; providerSubscriptionId: string }
  | { type: "subscription.canceled"; eventId: string; providerSubscriptionId: string };

export interface PaymentProvider {
  readonly name: "mock" | "stripe";
  createCheckout(params: CheckoutParams): Promise<CheckoutSession>;
  /** Re-fetch what the browser needs for an existing, unpaid checkout (retries/refreshes). */
  resumeCheckout(providerPaymentId: string): Promise<{ clientSecret: string }>;
  cancelSubscription(providerSubscriptionId: string): Promise<void>;
  refund(providerPaymentId: string, amountCents?: number): Promise<{ refundId: string }>;
}
