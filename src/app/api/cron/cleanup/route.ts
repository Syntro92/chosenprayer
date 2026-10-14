import { recordCronRun, requireCronSecret } from "@/server/cron";
import { handler, json } from "@/server/http";
import { runCleanup } from "@/server/services/cleanup";

/** Scheduled job (daily): delete old page views, expired counters, old sent emails and orphan uploads. */
async function run(req: Request) {
  requireCronSecret(req);
  try {
    const result = await runCleanup();
    await recordCronRun("cleanup", true, JSON.stringify(result));
    return json({ ok: true, ...result });
  } catch (e) {
    await recordCronRun("cleanup", false, e instanceof Error ? e.message : String(e)).catch(() => {});
    throw e;
  }
}

export const GET = handler(run, { csrf: false });
export const POST = handler(run, { csrf: false });
