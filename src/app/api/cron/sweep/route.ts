import { recordCronRun, requireCronSecret } from "@/server/cron";
import { handler, json } from "@/server/http";
import { sweepStaleDonations } from "@/server/services/giving";

/** Scheduled job: close checkouts nobody finished within 24 hours. Authorization: Bearer <CRON_SECRET>. */
async function run(req: Request) {
  requireCronSecret(req);
  try {
    const canceled = await sweepStaleDonations();
    await recordCronRun("sweep", true, `canceled ${canceled} stale donation(s)`);
    return json({ ok: true, canceled });
  } catch (e) {
    await recordCronRun("sweep", false, e instanceof Error ? e.message : String(e)).catch(() => {});
    throw e;
  }
}

export const GET = handler(run, { csrf: false });
export const POST = handler(run, { csrf: false });
