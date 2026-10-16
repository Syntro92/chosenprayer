import { adminRoute } from "@/server/admin-route";
import { json } from "@/server/http";
import { resolveReport } from "@/server/services/admin-reports";

/** Body: { action: "dismiss", note? } or { action: "remove", reason }. */
export const POST = adminRoute(
  async (req, { actor, params }) => json(await resolveReport(actor, params.id, await req.json().catch(() => ({})))),
  "admin",
);
