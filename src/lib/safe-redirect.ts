/**
 * Validates a post-sign-in destination (`?next=...`). Only same-site paths are
 * allowed; anything that could leave the site (absolute URLs, `//host`,
 * `/\host`, control characters) falls back to the default. This blocks
 * open-redirect phishing via crafted sign-in links.
 */
export function safeNext(next: string | null | undefined, fallback = "/community"): string {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  // Never bounce back into the auth pages themselves.
  if (/^\/(signin|signup|forgot-password|reset-password|auth)(\/|\?|$)/.test(next)) return fallback;
  return next;
}
