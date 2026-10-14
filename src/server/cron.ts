import "server-only";
import { timingSafeEqual } from "node:crypto";
import { db, type Queryable } from "./db";
import { getEnv } from "./env";
import { AppError } from "./errors";

/** Scheduled-job endpoints are called by a scheduler with `Authorization: Bearer <CRON_SECRET>`. */
export function requireCronSecret(req: Request): void {
  const header = req.headers.get("authorization") ?? "";
  const given = Buffer.from(header.startsWith("Bearer ") ? header.slice(7) : "");
  const expected = Buffer.from(getEnv().CRON_SECRET);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new AppError("UNAUTHENTICATED", "Invalid credentials.");
  }
}

/** Remembers when each job last ran and whether it worked (shown on the admin "Site health" page). */
export async function recordCronRun(job: string, ok: boolean, detail: string, conn: Queryable = db): Promise<void> {
  await conn.query(
    `insert into public.cron_runs (job, last_run_at, last_ok, detail) values ($1, now(), $2, left($3, 500))
     on conflict (job) do update set last_run_at = now(), last_ok = excluded.last_ok, detail = excluded.detail`,
    [job, ok, detail],
  );
}
