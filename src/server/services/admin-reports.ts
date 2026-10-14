import "server-only";
import { z } from "zod";
import { uuidSchema } from "@/lib/schemas/community";
import { requireRole, type Actor } from "../auth/policy";
import { db, one, type Queryable } from "../db";
import { AppError } from "../errors";
import { dismissReport, removeComment, removePost } from "./moderation";

const resolveSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("dismiss"), note: z.string().trim().max(300).optional() }),
  z.object({ action: z.literal("remove"), reason: z.string().trim().min(1, "Please give a reason.").max(300) }),
]);

/**
 * One call for the admin panel's report queue: "dismiss" (content is fine) or "remove" (take the
 * reported post/comment down). Both reuse the audited moderation services, so every report on the
 * same content is closed together. Moderators may do this, not just admins.
 */
export async function resolveReport(actor: Actor | null, rawId: string, raw: unknown, conn: Queryable = db): Promise<{ action: "dismiss" | "remove" }> {
  requireRole(actor, "moderator");
  const id = uuidSchema.safeParse(rawId);
  if (!id.success) throw new AppError("NOT_FOUND", "Report not found.");
  const input = resolveSchema.parse(raw);

  const r = await one<{ post_id: string | null; comment_id: string | null }>("select post_id, comment_id from public.reports where id = $1", [id.data], conn);
  if (!r) throw new AppError("NOT_FOUND", "Report not found.");

  if (input.action === "dismiss") {
    await dismissReport(actor, id.data, input.note ? { resolution: input.note } : {}, conn);
  } else if (r.comment_id) {
    await removeComment(actor, r.comment_id, { reason: input.reason }, conn);
  } else if (r.post_id) {
    await removePost(actor, r.post_id, { reason: input.reason }, conn);
  }
  return { action: input.action };
}
