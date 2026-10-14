import { settingsSchema } from "@/lib/schemas/admin";
import { adminRoute } from "@/server/admin-route";
import { json, parseJson } from "@/server/http";
import { getSettings, updateSettings } from "@/server/services/admin-config";

export const GET = adminRoute(async (_req, { actor }) => json(await getSettings(actor)));
export const PUT = adminRoute(async (req, { actor }) => json(await updateSettings(actor, await parseJson(req, settingsSchema))));
