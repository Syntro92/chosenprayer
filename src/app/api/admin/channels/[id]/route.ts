import { revalidateTag } from "next/cache";
import { updateChannelSchema } from "@/lib/schemas/admin";
import { adminRoute } from "@/server/admin-route";
import { json, parseJson } from "@/server/http";
import { getAdminChannel, updateAdminChannel } from "@/server/services/admin-channels";

export const GET = adminRoute(async (_req, { actor, params }) => json(await getAdminChannel(actor, params.id)));

export const PATCH = adminRoute(async (req, { actor, params }) => {
  const changed = await updateAdminChannel(actor, params.id, await parseJson(req, updateChannelSchema));
  revalidateTag("channels", "max");
  revalidateTag(`channel:${changed.handle.toLowerCase()}`, "max");
  return json(changed.channel);
});
