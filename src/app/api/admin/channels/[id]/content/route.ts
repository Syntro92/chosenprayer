import { revalidateTag } from "next/cache";
import { channelContentFeaturedSchema } from "@/lib/schemas/admin";
import { adminRoute } from "@/server/admin-route";
import { json, parseJson } from "@/server/http";
import { listAdminChannelContent, setChannelContentFeatured } from "@/server/services/admin-channel-content";

/** Every synced video/post for this channel, so the admin can choose which 3 feature. */
export const GET = adminRoute(async (_req, { actor, params }) => json(await listAdminChannelContent(actor, params.id)));

/** Body: { featured: [id|null, id|null, id|null] }. Sets the "Latest from" slots shown on the channel page. */
export const PUT = adminRoute(async (req, { actor, params }) => {
  const result = await setChannelContentFeatured(actor, params.id, await parseJson(req, channelContentFeaturedSchema));
  revalidateTag(`channel:${result.handle.toLowerCase()}`, "max");
  return json(result.items);
});
