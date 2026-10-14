import { z } from "zod";
import { AppError } from "./errors";

/**
 * Keyset pagination. A cursor remembers the sort value and id of the last row a
 * client saw, so the next page is "rows after that" (stable and index-friendly),
 * unlike OFFSET which drifts as rows are added.
 */
export interface Cursor {
  /** Value of the sort column for the last row (ISO date string, or a number). */
  k: string | number;
  /** Id of the last row: tie-breaker for equal sort values. */
  id: string;
}

const cursorSchema = z.object({ k: z.union([z.string(), z.number()]), id: z.string().min(1) });

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

/** Returns null for "first page"; throws VALIDATION for a tampered/garbled cursor. */
export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw) return null;
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
  } catch {
    throw new AppError("VALIDATION", "Invalid cursor.", { fields: { cursor: "Invalid cursor" } });
  }
}

export function clampLimit(n: unknown, fallback = DEFAULT_LIMIT, max = MAX_LIMIT): number {
  const v = typeof n === "string" ? Number(n) : (n as number);
  if (!Number.isFinite(v) || v < 1) return fallback;
  return Math.min(Math.floor(v), max);
}

export interface Page<T> {
  items: T[];
  /** Pass back as `cursor` to get the next page; null when there are no more. */
  nextCursor: string | null;
}

/**
 * Query for `limit + 1` rows, then hand them here: it trims the extra row and
 * builds the next cursor from the last returned item.
 */
export function toPage<T>(fetched: T[], limit: number, cursorOf: (item: T) => Cursor): Page<T> {
  const hasMore = fetched.length > limit;
  const items = hasMore ? fetched.slice(0, limit) : fetched;
  return { items, nextCursor: hasMore ? encodeCursor(cursorOf(items[items.length - 1])) : null };
}
