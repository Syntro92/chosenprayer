import { adminTransactionListSchema } from "@/lib/schemas/admin";
import { adminRoute } from "@/server/admin-route";
import { json, parseQuery } from "@/server/http";
import { listAdminTransactions } from "@/server/services/admin-transactions";

export const GET = adminRoute(async (req, { actor }) => json(await listAdminTransactions(actor, parseQuery(req, adminTransactionListSchema))));
