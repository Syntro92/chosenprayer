import "server-only";
import type { ZodType } from "zod";
import { getEnv } from "./env";
import { AppError, toAppError } from "./errors";
import { errorFields, log } from "./logger";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const MAX_BODY_BYTES = 1_000_000;
const SLOW_REQUEST_MS = 2_000;

/** Best-effort client IP behind a proxy/CDN. Only used for rate limiting, never for auth. */
export function ipFromHeaders(h: Headers): string {
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || "unknown";
}

export function clientIp(req: Request): string {
  return ipFromHeaders(req.headers);
}

/**
 * CSRF defence for cookie-authenticated JSON endpoints. A browser always sends
 * `Origin` on cross-site POSTs, so a mismatch is rejected. Requests without an
 * Origin (curl, server-to-server) can't carry a victim's cookies, but if the
 * browser says it is cross-site we still refuse.
 */
export function isSameOrigin(input: { origin: string | null; host: string | null; secFetchSite: string | null; appUrl: string }): boolean {
  const { origin, host, secFetchSite, appUrl } = input;
  if (origin) {
    try {
      const o = new URL(origin);
      return o.host === host || o.origin === new URL(appUrl).origin;
    } catch {
      return false;
    }
  }
  return secFetchSite !== "cross-site";
}

export function assertSameOrigin(req: Request): void {
  const ok = isSameOrigin({
    origin: req.headers.get("origin"),
    host: req.headers.get("host"),
    secFetchSite: req.headers.get("sec-fetch-site"),
    appUrl: getEnv().APP_URL,
  });
  if (!ok) throw new AppError("FORBIDDEN", "Cross-site request blocked.");
}

/** JSON response, `no-store` unless the caller sets its own Cache-Control. */
export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  return Response.json(data, { ...init, headers });
}

export async function parseJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) throw new AppError("VALIDATION", "Request body is too large.");
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new AppError("VALIDATION", "Request body is too large.");
  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new AppError("VALIDATION", "Request body must be valid JSON.");
  }
  return schema.parse(raw);
}

export function parseQuery<T>(req: Request, schema: ZodType<T>): T {
  return schema.parse(Object.fromEntries(new URL(req.url).searchParams));
}

interface HandlerOptions {
  /** Skip the same-origin check (webhooks and cron authenticate with signatures/secrets instead). */
  csrf?: boolean;
}

/**
 * Wraps a route handler: request id, same-origin check on mutating methods,
 * uniform error JSON `{ error: { code, message, fields? } }`, and logging.
 * Unexpected errors are logged in full but shown to the client as a generic 500.
 */
export function handler<C = unknown>(fn: (req: Request, ctx: C) => Promise<Response>, opts: HandlerOptions = {}) {
  return async (req: Request, ctx: C): Promise<Response> => {
    const requestId = crypto.randomUUID();
    const started = Date.now();
    const route = new URL(req.url).pathname;
    try {
      if (opts.csrf !== false && !SAFE_METHODS.has(req.method)) assertSameOrigin(req);
      const res = await fn(req, ctx);
      res.headers.set("x-request-id", requestId);
      const ms = Date.now() - started;
      if (ms > SLOW_REQUEST_MS) log.warn("slow request", { requestId, route, method: req.method, status: res.status, ms });
      return res;
    } catch (e) {
      const err = toAppError(e);
      if (err.code === "INTERNAL" || err.code === "UNAVAILABLE") {
        log.error("request failed", { requestId, route, method: req.method, ms: Date.now() - started, ...errorFields(err.cause ?? e) });
      } else {
        log.info("request rejected", { requestId, route, method: req.method, code: err.code });
      }
      const headers: Record<string, string> = { "x-request-id": requestId };
      if (err.retryAfter) headers["Retry-After"] = String(err.retryAfter);
      return json({ error: err.toBody() }, { status: err.status, headers });
    }
  };
}
