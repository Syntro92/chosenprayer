import "server-only";
import Stripe from "stripe";
import { getEnv } from "../../env";
import { AppError } from "../../errors";
import { mockPayments } from "./mock";
import { createStripeProvider } from "./stripe";
import { stripeKeyMode } from "./stripe-mode";
import type { PaymentProvider } from "./types";

const unavailable = () => new AppError("UNAVAILABLE", "Payments aren't available right now. Please try again later.");

let stripeClient: Stripe | undefined;

/** One Stripe client per process. Pinned retry/timeouts so a slow Stripe can't hang a request. */
export function getStripeClient(): Stripe {
  const env = getEnv();
  if (env.PAYMENTS_PROVIDER !== "stripe" || !env.STRIPE_SECRET_KEY) throw unavailable();
  return (stripeClient ??= new Stripe(env.STRIPE_SECRET_KEY, {
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: { name: "chosen-prayer" },
  }));
}

/**
 * The configured payment provider.
 *
 * The mock refuses to run in production: a deployment that forgot to configure Stripe must
 * fail loudly ("payments unavailable"), never quietly accept fake payments as real ones.
 */
export function getPaymentProvider(): PaymentProvider {
  const env = getEnv();
  if (env.PAYMENTS_PROVIDER === "mock") {
    if (env.NODE_ENV === "production") throw unavailable();
    return mockPayments;
  }
  return createStripeProvider(getStripeClient());
}

/** Which provider is active and whether it is a sandbox (no real money). Shown in the site and admin. */
export function getPaymentsMode(): { provider: "mock" | "stripe"; testMode: boolean } {
  const env = getEnv();
  if (env.PAYMENTS_PROVIDER === "mock") return { provider: "mock", testMode: true };
  return { provider: "stripe", testMode: stripeKeyMode(env.STRIPE_SECRET_KEY) !== "live" };
}

export type { CheckoutParams, CheckoutSession, PaymentEvent, PaymentProvider } from "./types";
