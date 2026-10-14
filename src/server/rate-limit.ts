import "server-only";
import { db, type Queryable } from "./db";
import { AppError } from "./errors";
import { log, errorFields } from "./logger";

export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

/** Named limits from the design doc. Identifier is an IP, a user id or a visitor id. */
export const RATE_LIMITS = {
  signin: { limit: 10, windowSeconds: 600 },
  signup: { limit: 5, windowSeconds: 3600 },
  passwordReset: { limit: 5, windowSeconds: 3600 },
  post: { limit: 10, windowSeconds: 3600 },
  comment: { limit: 30, windowSeconds: 3600 },
  like: { limit: 120, windowSeconds: 600 },
  follow: { limit: 60, windowSeconds: 600 },
  report: { limit: 20, windowSeconds: 86_400 },
  upload: { limit: 30, windowSeconds: 3600 },
  donation: { limit: 10, windowSeconds: 3600 },
  blessing: { limit: 10, windowSeconds: 3600 },
  track: { limit: 120, windowSeconds: 60 },
  publicRead: { limit: 120, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
}

/** Registers a hit for `key` and reports the outcome (does not throw). */
export async function hit(key: string, rule: RateLimitRule, conn: Queryable = db): Promise<RateLimitResult> {
  const { rows } = await conn.query<{ allowed: boolean; remaining: number; retry_after: number }>(
    "select allowed, remaining, retry_after from public.rate_limit_hit($1, $2, $3)",
    [key, rule.limit, rule.windowSeconds],
  );
  const r = rows[0];
  return { allowed: r.allowed, remaining: r.remaining, retryAfter: r.retry_after };
}

/**
 * Throws RATE_LIMITED when `identifier` has exceeded the named rule.
 * Fails OPEN if the limiter itself errors: a broken counter should not take the
 * whole product down (the database being down fails everything else anyway).
 */
export async function enforceRateLimit(name: RateLimitName, identifier: string, conn: Queryable = db): Promise<void> {
  let result: RateLimitResult;
  try {
    result = await hit(`${name}:${identifier}`, RATE_LIMITS[name], conn);
  } catch (e) {
    log.error("rate limiter failed; allowing request", { name, ...errorFields(e) });
    return;
  }
  if (!result.allowed) {
    throw new AppError("RATE_LIMITED", "Too many attempts. Please wait a moment and try again.", {
      retryAfter: result.retryAfter,
    });
  }
}
