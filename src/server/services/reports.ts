import "server-only";
import { reportSchema, uuidSchema } from "@/lib/schemas/community";
import { requireMember, type Actor } from "../auth/policy";
import { db, one, type Queryable } from "../db";
import { AppError } from "../errors";
import { enforceRateLimit } from "../rate-limit";

/**
 * Members flag a post or comment for review. This milestone only RECORDS reports;
 * the report queue and the actions that resolve them arrive in M4.
 */
async function file(
  actor: Actor | null,
  kind: "post" | "comment",
  rawId: string,
  raw: unknown,
  conn: Queryable,
): Promise<void> {
  const a = requireMember(actor);
  const id = uuidSchema.safeParse(rawId);
  const input = reportSchema.parse(raw);
  const missing = () => new AppError("NOT_FOUND", kind === "post" ? "Post not found." : "Comment not found.");
  if (!id.success) throw missing();
  await enforceRateLimit("report", a.userId, conn);

  const target = await one<{ author_id: string }>(
    kind === "post"
      ? "select author_id from public.posts where id = $1 and status = 'visible'"
      : "select author_id from public.comments where id = $1 and status = 'visible'",
    [id.data],
    conn,
  );
  if (!target) throw missing();
  if (target.author_id === a.userId) {
    throw new AppError("VALIDATION", `You can't report your own ${kind}.`);
  }

  try {
    await conn.query(
      `insert into public.reports (reporter_id, post_id, comment_id, reason, note) values ($1, $2, $3, $4, $5)`,
      [a.userId, kind === "post" ? id.data : null, kind === "comment" ? id.data : null, input.reason, input.note],
    );
  } catch (e) {
    if ((e as { code?: string }).code === "23505") {
      throw new AppError("CONFLICT", `You've already reported this ${kind}. Our team will take a look.`);
    }
    throw e;
  }
}

export const reportPost = (actor: Actor | null, id: string, raw: unknown, conn: Queryable = db) => file(actor, "post", id, raw, conn);
export const reportComment = (actor: Actor | null, id: string, raw: unknown, conn: Queryable = db) => file(actor, "comment", id, raw, conn);
