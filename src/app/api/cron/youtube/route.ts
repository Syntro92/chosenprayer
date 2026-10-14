import { revalidateTag } from "next/cache";
import { recordCronRun, requireCronSecret } from "@/server/cron";
import { handler, json } from "@/server/http";
import { syncAllYoutube } from "@/server/services/youtube";

/** Scheduled job (daily): refresh subscriber counts and recent videos of every live linked channel. */
async function run(req: Request) {
  requireCronSecret(req);
  try {
    const { synced, failed } = await syncAllYoutube();
    if (synced.length) {
      revalidateTag("channels", "max");
      for (const h of synced) revalidateTag(`channel:${h.toLowerCase()}`, "max");
    }
    await recordCronRun("youtube", failed === 0, JSON.stringify({ synced: synced.length, failed }));
    return json({ ok: true, synced: synced.length, failed });
  } catch (e) {
    await recordCronRun("youtube", false, e instanceof Error ? e.message : String(e)).catch(() => {});
    throw e;
  }
}

export const GET = handler(run, { csrf: false });
export const POST = handler(run, { csrf: false });
