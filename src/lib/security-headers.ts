// Security headers for every response. A plain module (no server-only) so next.config.ts and the
// unit tests can both import it.

export interface Header {
  key: string;
  value: string;
}

/**
 * Content-Security-Policy. What each part is for:
 *  - script/style 'unsafe-inline': Next.js emits inline bootstrap scripts and the admin panel inline
 *    styles; a nonce-based policy needs per-request rendering, which would defeat static pages.
 *    Scripts can still only come from this origin, which blocks injected third-party scripts.
 *  - Supabase: signed upload/read URLs for community attachments and the auth API.
 *  - YouTube (no-cookie) for embedded channel videos. Google Fonts only for the admin panel.
 *  - Stripe: its card form is an iframe from js.stripe.com (plus hooks.stripe.com for bank 3-D Secure
 *    challenges) and talks to api.stripe.com; cards never touch our servers.
 */
// Free page translation (components/page-translator.tsx) loads Google's widget script and its styles.
const GOOGLE_TRANSLATE_SCRIPT = ["https://translate.google.com", "https://translate.googleapis.com", "https://translate-pa.googleapis.com", "https://www.gstatic.com"];

export function contentSecurityPolicy(opts: { dev?: boolean } = {}): string {
  const dev = !!opts.dev;
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", "https://js.stripe.com", ...GOOGLE_TRANSLATE_SCRIPT, ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://translate.googleapis.com", "https://www.gstatic.com"],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "media-src": ["'self'", "https://*.supabase.co"],
    "connect-src": ["'self'", "https://*.supabase.co", "https://translate.googleapis.com", "https://translate-pa.googleapis.com", "https://api.stripe.com", "https://merchant-ui-api.stripe.com", ...(dev ? ["ws://localhost:*", "ws://127.0.0.1:*"] : [])],
    "frame-src": ["https://www.youtube-nocookie.com", "https://js.stripe.com", "https://hooks.stripe.com", "https://m.stripe.network"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (!dev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export function securityHeaders(opts: { dev?: boolean } = {}): Header[] {
  const headers: Header[] = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(opts) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self), interest-cohort=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
  // HSTS only where HTTPS is guaranteed; sending it over plain-http localhost would be ignored anyway.
  if (!opts.dev) headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
  return headers;
}
