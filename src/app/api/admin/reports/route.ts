import { z } from "zod";
import { adminRoute } from "@/server/admin-route";
import { json, parseQuery } from "@/server/http";
import { listReports } from "@/server/services/moderation";

const query = z.object({
  status: z.enum(["open", "handled"]).default("open"),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** Moderators can work the queue too. */
export const GET = adminRoute(async (req, { actor }) => json(await listReports(actor, parseQuery(req, query))), "moderator");
