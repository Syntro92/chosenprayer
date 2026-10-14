// Pure helpers (no server-only) so env validation and tests can share them.

export type StripeMode = "test" | "live";

/** `sk_test_…` / `rk_test_…` are sandbox keys, `sk_live_…` / `rk_live_…` move real money. */
export function stripeKeyMode(key: string | undefined | null): StripeMode | null {
  if (!key) return null;
  if (/^(sk|rk)_test_/.test(key)) return "test";
  if (/^(sk|rk)_live_/.test(key)) return "live";
  return null;
}

export const publishableKeyMode = (key: string | undefined | null): StripeMode | null =>
  key?.startsWith("pk_test_") ? "test" : key?.startsWith("pk_live_") ? "live" : null;

/**
 * Throws a readable message when the Stripe settings are unsafe or inconsistent:
 *  - keys must look like Stripe keys
 *  - secret and publishable key must belong to the same mode (never half test, half live)
 *  - LIVE keys are refused outside production, so a laptop can never charge real cards by accident
 */
export function assertStripeConfig(env: {
  NODE_ENV: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_PUBLISHABLE_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
}): StripeMode {
  const mode = stripeKeyMode(env.STRIPE_SECRET_KEY);
  if (!env.STRIPE_SECRET_KEY || !mode) throw new Error("STRIPE_SECRET_KEY must be a Stripe secret key (sk_test_… for the sandbox)");
  const pkMode = publishableKeyMode(env.STRIPE_PUBLISHABLE_KEY);
  if (!pkMode) throw new Error("PAYMENTS_PROVIDER=stripe requires STRIPE_PUBLISHABLE_KEY (pk_test_… for the sandbox)");
  if (pkMode !== mode) throw new Error(`STRIPE_SECRET_KEY is a ${mode} key but STRIPE_PUBLISHABLE_KEY is a ${pkMode} key`);
  if (!env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_")) throw new Error("STRIPE_WEBHOOK_SECRET must be a webhook signing secret (whsec_…)");
  if (mode === "live" && env.NODE_ENV !== "production") throw new Error("Live Stripe keys are only allowed in production. Use sandbox (test) keys here.");
  return mode;
}
