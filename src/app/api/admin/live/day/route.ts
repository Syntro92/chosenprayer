import { liveDayQuerySchema } from "@/lib/schemas/admin";
import { adminRoute } from "@/server/admin-route";
import { json, parseQuery } from "@/server/http";
import { getDayVisits } from "@/server/services/admin-insights";

/** Live Visitors calendar: visitors and page views for one day (?date=YYYY-MM-DD&tz=Area/City). */
export const GET = adminRoute(async (req, { actor }) => json(await getDayVisits(actor, parseQuery(req, liveDayQuerySchema))));
