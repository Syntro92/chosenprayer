import { adminRoute } from "@/server/admin-route";
import { json } from "@/server/http";
import { clearVisitCounter } from "@/server/services/admin-insights";

/** "Clear count" on Live Visitors: resets the saved visit totals to zero. */
export const DELETE = adminRoute(async (_req, { actor }) => json(await clearVisitCounter(actor)));
