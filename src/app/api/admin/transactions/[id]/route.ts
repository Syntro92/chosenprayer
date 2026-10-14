import { adminRoute } from "@/server/admin-route";
import { json } from "@/server/http";
import { getAdminTransaction } from "@/server/services/admin-transactions";

export const GET = adminRoute(async (_req, { actor, params }) => json(await getAdminTransaction(actor, params.id)));
