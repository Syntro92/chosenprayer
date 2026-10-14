import { analyticsQuerySchema } from "@/lib/schemas/admin";
import { adminRoute } from "@/server/admin-route";
import { json, parseQuery } from "@/server/http";
import { getAnalytics } from "@/server/services/admin-insights";

export const GET = adminRoute(async (req, { actor }) => json(await getAnalytics(actor, parseQuery(req, analyticsQuerySchema))));
