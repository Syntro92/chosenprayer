import { revalidateTag } from "next/cache";
import { adminRoute } from "@/server/admin-route";
import { json, parseJson } from "@/server/http";
import { getGivingSettings, updateGivingSettings } from "@/server/services/giving-settings";
import { givingSettingsSchema } from "@/lib/schemas/admin";

export const GET = adminRoute(async (_req, { actor }) => json(await getGivingSettings(actor)));
export const PUT = adminRoute(async (req, { actor }) => {
  const saved = await updateGivingSettings(actor, await parseJson(req, givingSettingsSchema));
  revalidateTag("channels", { expire: 0 }); // every channel page shows these; the next visitor must see the change
  return json(saved);
});
