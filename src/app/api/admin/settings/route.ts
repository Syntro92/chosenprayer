import { revalidateTag } from "next/cache";
import { settingsSchema } from "@/lib/schemas/admin";
import { adminRoute } from "@/server/admin-route";
import { json, parseJson } from "@/server/http";
import { getSettings, updateSettings } from "@/server/services/admin-config";

export const GET = adminRoute(async (_req, { actor }) => json(await getSettings(actor)));
export const PUT = adminRoute(async (req, { actor }) => {
  const saved = await updateSettings(actor, await parseJson(req, settingsSchema));
  revalidateTag("site", { expire: 0 }); // the landing page cover lives behind this tag; the next visitor must see the change, not a stale copy
  return json(saved);
});
