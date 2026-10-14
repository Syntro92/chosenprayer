import { recordCronRun, requireCronSecret } from "@/server/cron";
import { handler, json } from "@/server/http";
import { processOutbox } from "@/server/services/email";

/** Scheduled job: send queued emails. Authorization: Bearer <CRON_SECRET>. */
async function run(req: Request) {
  requireCronSecret(req);
  try {
    const result = await processOutbox({ limit: 25 });
    await recordCronRun("email", true, JSON.stringify(result));
    return json({ ok: true, ...result });
  } catch (e) {
    await recordCronRun("email", false, e instanceof Error ? e.message : String(e)).catch(() => {});
    throw e;
  }
}

// GET for schedulers that can only issue GETs (Vercel Cron); POST for everything else.
export const GET = handler(run, { csrf: false });
export const POST = handler(run, { csrf: false });
