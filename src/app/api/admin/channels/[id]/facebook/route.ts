import { revalidateTag } from "next/cache";
import { facebookSyncSchema } from "@/lib/schemas/admin";
import { adminRoute } from "@/server/admin-route";
import { json, parseJson } from "@/server/http";
import { syncAdminChannelFacebook } from "@/server/services/facebook";

/** Link a Facebook Page (body { facebookPage }) or re-sync the linked one (empty body). */
export const POST = adminRoute(async (req, { actor, params }) => {
  const result = await syncAdminChannelFacebook(actor, params.id, await parseJson(req, facebookSyncSchema));
  revalidateTag("channels", "max");
  revalidateTag(`channel:${result.handle.toLowerCase()}`, "max");
  return json(result);
});
