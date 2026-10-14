import { adminUserListSchema, createUserSchema } from "@/lib/schemas/admin";
import { adminRoute } from "@/server/admin-route";
import { json, parseJson, parseQuery } from "@/server/http";
import { createAdminUser, listAdminUsers } from "@/server/services/admin-users";

export const GET = adminRoute(async (req, { actor }) => json(await listAdminUsers(actor, parseQuery(req, adminUserListSchema))));

/** Body: { fullName, email, password, role? }. Creates a confirmed account with the chosen role. */
export const POST = adminRoute(async (req, { actor }) =>
  json(await createAdminUser(actor, await parseJson(req, createUserSchema)), { status: 201 }),
);
