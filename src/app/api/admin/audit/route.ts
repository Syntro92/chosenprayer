import { auditQuerySchema } from "@/lib/schemas/admin";
import { adminRoute } from "@/server/admin-route";
import { json, parseQuery } from "@/server/http";
import { listAuditLog } from "@/server/services/audit";

export const GET = adminRoute(async (req, { actor }) => json(await listAuditLog(actor, parseQuery(req, auditQuerySchema))));
