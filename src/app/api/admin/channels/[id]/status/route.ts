import { revalidateTag } from "next/cache";
import { channelStatusSchema } from "@/lib/schemas/admin";
import { adminRoute } from "@/server/admin-route";
import { json, parseJson } from "@/server/http";
import { setChannelStatus } from "@/server/services/admin-channels";

/** Approve / pause / archive. Body: { status, note? } */
export const POST = adminRoute(async (req, { actor, params }) => {
  const changed = await setChannelStatus(actor, params.id, await parseJson(req, channelStatusSchema));
  revalidateTag("channels", "max");
  revalidateTag(`channel:${changed.handle.toLowerCase()}`, "max");
  return json(changed.channel);
});
