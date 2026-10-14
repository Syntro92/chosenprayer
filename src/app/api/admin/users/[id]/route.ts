import { updateUserSchema } from "@/lib/schemas/admin";
import { adminRoute } from "@/server/admin-route";
import { json, parseJson } from "@/server/http";
import { getAdminUser, updateAdminUser } from "@/server/services/admin-users";

export const GET = adminRoute(async (_req, { actor, params }) => json(await getAdminUser(actor, params.id)));

/** Body: any of { role, status, verified, reason }. A reason is required when suspending. */
export const PATCH = adminRoute(async (req, { actor, params }) =>
  json(await updateAdminUser(actor, params.id, await parseJson(req, updateUserSchema))),
);
