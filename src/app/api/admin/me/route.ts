import { adminRoute } from "@/server/admin-route";
import { json } from "@/server/http";

/** Who am I? The admin panel uses this to decide whether to show the login screen. */
export const GET = adminRoute(
  async (_req, { actor }) =>
    json({ id: actor.userId, name: actor.displayName, username: actor.username, role: actor.role, mustChangePassword: !!actor.mustChangePassword }),
  "admin",
  { allowTempPassword: true },
);
