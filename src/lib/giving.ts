// Client-safe giving constants and helpers.

/** Limits in WHOLE currency units, as the support form works in whole dollars. */
export const GIVING_LIMITS = { minAmount: 1, maxAmount: 999_999 } as const;

export const DONATION_SOURCES = ["web", "mobile", "social", "email", "offline", "other"] as const;

/**
 * A provider receipt link, or null. Only https pages on stripe.com are accepted, so a bad value can
 * never put an arbitrary link in an email or on a page.
 */
export function safeReceiptUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 500) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:") return null;
    if (u.hostname !== "stripe.com" && !u.hostname.endsWith(".stripe.com")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** "$25", "$25.50", "€1,000" (cents in, display string out). */
export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
