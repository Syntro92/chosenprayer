import { revalidateTag } from "next/cache";
import { adminChannelListSchema, createChannelSchema } from "@/lib/schemas/admin";
import { adminRoute } from "@/server/admin-route";
import { json, parseJson, parseQuery } from "@/server/http";
import { createAdminChannel, listAdminChannels } from "@/server/services/admin-channels";

export const GET = adminRoute(async (req, { actor }) => json(await listAdminChannels(actor, parseQuery(req, adminChannelListSchema))));

export const POST = adminRoute(async (req, { actor }) => {
  const created = await createAdminChannel(actor, await parseJson(req, createChannelSchema));
  revalidateTag("channels", "max");
  return json(created.channel, { status: 201 });
});
