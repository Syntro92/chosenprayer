import { connection } from "next/server";
import { db } from "@/server/db";
import { json } from "@/server/http";
import { errorFields, log } from "@/server/logger";

/**
 * Liveness + database check for uptime monitors and the admin "Site health" page.
 * Returns 200 when the database answers, 503 otherwise. Reveals no internals.
 */
export async function GET() {
  await connection(); // always run at request time, never prerendered into a static response

  const started = Date.now();
  let dbOk = false;
  try {
    await db.query("select 1");
    dbOk = true;
  } catch (e) {
    log.error("health check: database unreachable", errorFields(e));
  }

  return json(
    { ok: dbOk, time: new Date().toISOString(), checks: { database: { ok: dbOk, ms: Date.now() - started } } },
    { status: dbOk ? 200 : 503 },
  );
}
