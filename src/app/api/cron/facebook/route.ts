import { revalidateTag } from "next/cache";
import { recordCronRun, requireCronSecret } from "@/server/cron";
import { handler, json } from "@/server/http";
import { syncAllFacebook } from "@/server/services/facebook";

/** Scheduled job (daily): refresh follower counts and recent posts of every live linked page. */
async function run(req: Request) {
  requireCronSecret(req);
  try {
    const { synced, failed } = await syncAllFacebook();
    if (synced.length) {
      revalidateTag("channels", "max");
      for (const h of synced) revalidateTag(`channel:${h.toLowerCase()}`, "max");
    }
    await recordCronRun("facebook", failed === 0, JSON.stringify({ synced: synced.length, failed }));
    return json({ ok: true, synced: synced.length, failed });
  } catch (e) {
    await recordCronRun("facebook", false, e instanceof Error ? e.message : String(e)).catch(() => {});
    throw e;
  }
}

export const GET = handler(run, { csrf: false });
export const POST = handler(run, { csrf: false });
