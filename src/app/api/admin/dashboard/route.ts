import { adminRoute } from "@/server/admin-route";
import { json } from "@/server/http";
import { getDashboard } from "@/server/services/admin-insights";

export const GET = adminRoute(async (_req, { actor }) => json(await getDashboard(actor)));
