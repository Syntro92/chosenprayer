import { revalidateTag } from "next/cache";
import { updateChannelSchema } from "@/lib/schemas/admin";
import { adminRoute } from "@/server/admin-route";
import { json, parseJson } from "@/server/http";
import { deleteAdminChannel, getAdminChannel, updateAdminChannel } from "@/server/services/admin-channels";

export const GET = adminRoute(async (_req, { actor, params }) => json(await getAdminChannel(actor, params.id)));

export const PATCH = adminRoute(async (req, { actor, params }) => {
  const changed = await updateAdminChannel(actor, params.id, await parseJson(req, updateChannelSchema));
  revalidateTag("channels", "max");
  revalidateTag(`channel:${changed.handle.toLowerCase()}`, "max");
  return json(changed.channel);
});

export const DELETE = adminRoute(async (_req, { actor, params }) => {
  const { handle } = await deleteAdminChannel(actor, params.id);
  revalidateTag("channels", "max");
  revalidateTag(`channel:${handle.toLowerCase()}`, "max");
  return json({ ok: true });
});
