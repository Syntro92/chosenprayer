import { revalidateTag } from "next/cache";
import { youtubeSyncSchema } from "@/lib/schemas/admin";
import { adminRoute } from "@/server/admin-route";
import { json, parseJson } from "@/server/http";
import { syncAdminChannelYoutube } from "@/server/services/youtube";

/** Link a YouTube channel (body { youtubeChannel }) or re-sync the linked one (empty body). */
export const POST = adminRoute(async (req, { actor, params }) => {
  const result = await syncAdminChannelYoutube(actor, params.id, await parseJson(req, youtubeSyncSchema));
  revalidateTag("channels", "max");
  revalidateTag(`channel:${result.handle.toLowerCase()}`, "max");
  return json(result);
});
