import { ZodError } from "zod";

// No "server-only" here on purpose: the error/result *types* are safe to import anywhere.

export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PAYMENT_FAILED"
  | "UNAVAILABLE"
  | "INTERNAL";

export const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  PAYMENT_FAILED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  UNAVAILABLE: 503,
};

export interface ErrorBody {
  code: ErrorCode;
  message: string;
  /** Per-field messages for forms, e.g. { email: "Enter a valid email" }. */
  fields?: Record<string, string>;
  /** Seconds, for RATE_LIMITED. */
  retryAfter?: number;
}

/** An expected, user-presentable failure. Anything else is treated as INTERNAL. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields?: Record<string, string>;
  readonly retryAfter?: number;

  constructor(code: ErrorCode, message: string, opts: { fields?: Record<string, string>; retryAfter?: number; cause?: unknown } = {}) {
    super(message, { cause: opts.cause });
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.fields = opts.fields;
    this.retryAfter = opts.retryAfter;
  }

  toBody(): ErrorBody {
    return { code: this.code, message: this.message, fields: this.fields, retryAfter: this.retryAfter };
  }
}

type PgLikeError = { code?: string; message?: string; constraint?: string; detail?: string };

/**
 * Turns anything thrown into an AppError.
 *  - Postgres errors raised by our triggers (check_violation with no constraint
 *    name) carry a human message, so they are passed through.
 *  - Constraint/other database errors get generic, non-leaky messages.
 */
export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;

  if (e instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of e.issues) {
      const key = issue.path.join(".") || "_";
      fields[key] ??= issue.message;
    }
    return new AppError("VALIDATION", "Please check the highlighted fields.", { fields, cause: e });
  }

  const pg = e as PgLikeError | null;
  switch (pg?.code) {
    case "23505":
      return new AppError("CONFLICT", "That already exists.", { cause: e });
    case "23503":
      return new AppError("VALIDATION", "A related item does not exist.", { cause: e });
    case "23502":
      return new AppError("VALIDATION", "A required value is missing.", { cause: e });
    case "23514":
      return new AppError("VALIDATION", pg.constraint ? "A value is not allowed." : (pg.message ?? "A value is not allowed."), { cause: e });
    case "22P02":
    case "22001":
    case "22003":
      return new AppError("VALIDATION", "A value has the wrong format.", { cause: e });
    case "42501":
      return new AppError("FORBIDDEN", "You are not allowed to do that.", { cause: e });
    case "40001":
    case "40P01":
      return new AppError("CONFLICT", "Please try again.", { cause: e });
    case "57014":
    case "53300":
    case "57P03":
      return new AppError("UNAVAILABLE", "The service is busy. Please try again shortly.", { cause: e });
    default:
      return new AppError("INTERNAL", "Something went wrong.", { cause: e });
  }
}

// --- Server Action results -------------------------------------------------
// Expected failures are returned, not thrown, so the UI can render them.

export type Result<T> = { ok: true; data: T } | { ok: false; error: ErrorBody };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const fail = (e: unknown): Result<never> => ({ ok: false, error: toAppError(e).toBody() });
