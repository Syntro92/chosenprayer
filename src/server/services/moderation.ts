import "server-only";
import { z } from "zod";
import { uuidSchema } from "@/lib/schemas/community";
import { authAdmin, type AuthAdmin } from "../auth/auth-admin";
import { canModerateRole, requireRole, type Actor, type Role } from "../auth/policy";
import { db, inTransaction, one, rows, type Queryable } from "../db";
import { AppError } from "../errors";
import { clampLimit, decodeCursor, encodeCursor } from "../pagination";
import { getEnv } from "../env";
import { audit } from "./audit";
import { ISO_US, PG_BAD_INPUT, UUID_RE } from "./community-shared";
import { enqueueEmail, flushOutboxSoon } from "./email";
import { notify } from "./notifications";

const reasonSchema = z.object({
  reason: z.string().trim().min(1, "Please give a reason.").max(300, "Reasons can be up to 300 characters."),
});

const notFound = (what: string) => new AppError("NOT_FOUND", `${what} not found.`);
const denied = () => new AppError("FORBIDDEN", "You can't moderate content from a moderator or admin.");

/* ------------------------------------------------------------------------ */
/* Removing content                                                          */
/* ------------------------------------------------------------------------ */

interface Target {
  author_id: string;
  author_role: Role;
  status: "visible" | "removed";
  body: string;
}

/**
 * Soft-removes a post (hidden from everyone, kept as evidence), closes its open reports
 * as "actioned", tells the author why, and writes the audit trail, all atomically.
 * Moderators act on members; admins on members and moderators. To remove your own post,
 * delete it normally.
 */
export async function removePost(actor: Actor | null, rawId: string, raw: unknown, conn: Queryable = db): Promise<void> {
  const a = requireRole(actor, "moderator");
  const id = uuidSchema.safeParse(rawId);
  if (!id.success) throw notFound("Post");
  const { reason } = reasonSchema.parse(raw);

  await inTransaction(conn, async (c) => {
    const t = await one<Target>(
      `select p.author_id, pr.role as author_role, p.status, p.body
       from public.posts p join public.profiles pr on pr.id = p.author_id
       where p.id = $1 for update of p`,
      [id.data],
      c,
    );
    if (!t || t.status !== "visible") throw notFound("Post");
    if (t.author_id === a.userId) throw new AppError("VALIDATION", "That's your own post. Delete it instead.");
    if (!canModerateRole(a.role, t.author_role)) throw denied();

    await c.query(
      "update public.posts set status = 'removed', removed_by = $2, removed_at = now(), removal_reason = $3 where id = $1",
      [id.data, a.userId, reason],
    );
    const closed = await c.query(
      `update public.reports set status = 'actioned', handled_by = $2, handled_at = now(), resolution = $3
       where post_id = $1 and status = 'open'`,
      [id.data, a.userId, `Post removed: ${reason}`],
    );
    await notify(c, {
      userId: t.author_id,
      actorId: a.userId,
      type: "moderation",
      text: `A moderator removed your post: ${reason}`,
      href: "/community",
    });
    await audit(c, {
      actorId: a.userId,
      action: "post.remove",
      entityType: "post",
      entityId: id.data,
      metadata: { reason, authorId: t.author_id, excerpt: t.body.slice(0, 140), closedReports: closed.rowCount ?? 0 },
    });
  });
}

export const MAX_PINNED_POSTS = 3;

/**
 * Pins (or unpins) a post so it stays at the top of the main feed. Admins only. At most
 * MAX_PINNED_POSTS at a time, so the top of the feed never turns into a wall of notices.
 */
export async function pinPost(actor: Actor | null, rawId: string, raw: unknown, conn: Queryable = db): Promise<void> {
  const a = requireRole(actor, "admin");
  const id = uuidSchema.safeParse(rawId);
  if (!id.success) throw notFound("Post");
  const { pinned } = z.object({ pinned: z.boolean() }).parse(raw);

  await inTransaction(conn, async (c) => {
    // One pin/unpin at a time, so two admins can't both squeeze past the limit.
    await c.query("select pg_advisory_xact_lock(hashtext('pinned_posts'))");
    const p = await one<{ status: string; pinned_at: string | null; body: string }>(
      "select status, pinned_at::text as pinned_at, body from public.posts where id = $1 for update",
      [id.data],
      c,
    );
    if (!p || p.status !== "visible") throw notFound("Post");
    if (!!p.pinned_at === pinned) return; // already in that state

    if (pinned) {
      const n = (await one<{ n: number }>("select count(*)::int as n from public.posts where pinned_at is not null and status = 'visible'", [], c))!.n;
      if (n >= MAX_PINNED_POSTS) {
        throw new AppError("CONFLICT", `You can pin up to ${MAX_PINNED_POSTS} posts. Unpin one first.`);
      }
      await c.query("update public.posts set pinned_at = now(), pinned_by = $2 where id = $1", [id.data, a.userId]);
    } else {
      await c.query("update public.posts set pinned_at = null, pinned_by = null where id = $1", [id.data]);
    }
    await audit(c, {
      actorId: a.userId,
      action: pinned ? "post.pin" : "post.unpin",
      entityType: "post",
      entityId: id.data,
      metadata: { excerpt: p.body.slice(0, 140) },
    });
  });
}

/** Same as removePost, for a comment. Its replies are removed with it. */
export async function removeComment(actor: Actor | null, rawId: string, raw: unknown, conn: Queryable = db): Promise<void> {
  const a = requireRole(actor, "moderator");
  const id = uuidSchema.safeParse(rawId);
  if (!id.success) throw notFound("Comment");
  const { reason } = reasonSchema.parse(raw);

  await inTransaction(conn, async (c) => {
    const t = await one<Target & { post_id: string }>(
      `select c.author_id, pr.role as author_role, c.status, c.body, c.post_id
       from public.comments c join public.profiles pr on pr.id = c.author_id
       where c.id = $1 for update of c`,
      [id.data],
      c,
    );
    if (!t || t.status !== "visible") throw notFound("Comment");
    if (t.author_id === a.userId) throw new AppError("VALIDATION", "That's your own comment. Delete it instead.");
    if (!canModerateRole(a.role, t.author_role)) throw denied();

    const removed = await c.query(
      `update public.comments set status = 'removed', removed_by = $2, removed_at = now(), removal_reason = $3
       where (id = $1 or parent_id = $1) and status = 'visible'`,
      [id.data, a.userId, reason],
    );
    const closed = await c.query(
      `update public.reports set status = 'actioned', handled_by = $2, handled_at = now(), resolution = $3
       where status = 'open' and comment_id in (select id from public.comments where id = $1 or parent_id = $1)`,
      [id.data, a.userId, `Comment removed: ${reason}`],
    );
    await notify(c, {
      userId: t.author_id,
      actorId: a.userId,
      type: "moderation",
      text: `A moderator removed your comment: ${reason}`,
      href: `/community/posts/${t.post_id}`,
    });
    await audit(c, {
      actorId: a.userId,
      action: "comment.remove",
      entityType: "comment",
      entityId: id.data,
      metadata: {
        reason,
        authorId: t.author_id,
        postId: t.post_id,
        excerpt: t.body.slice(0, 140),
        removedComments: removed.rowCount ?? 0,
        closedReports: closed.rowCount ?? 0,
      },
    });
  });
}

/* ------------------------------------------------------------------------ */
/* Reports                                                                   */
/* ------------------------------------------------------------------------ */

export interface ReportItem {
  id: string;
  status: "open" | "dismissed" | "actioned";
  reason: "spam" | "harassment" | "inappropriate" | "other";
  note: string;
  ageMinutes: number;
  reporter: { name: string; username: string };
  target: {
    kind: "post" | "comment";
    id: string;
    postId: string;
    text: string;
    removed: boolean;
    attachments: number;
    author: { id: string; name: string; username: string; role: Role };
  };
  /** How many OPEN reports currently point at this same content. */
  openReports: number;
  handledBy?: string;
  resolution?: string;
}

const reportsQuerySchema = z.object({
  status: z.enum(["open", "handled"]).default("open"),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

interface ReportRow {
  id: string;
  status: ReportItem["status"];
  reason: ReportItem["reason"];
  note: string;
  age_minutes: number;
  sort_raw: string;
  reporter_name: string;
  reporter_username: string;
  handler_name: string | null;
  resolution: string | null;
  kind: "post" | "comment";
  target_id: string;
  post_id: string;
  text: string;
  removed: boolean;
  attachments: number;
  author_id: string;
  author_name: string;
  author_username: string;
  author_role: Role;
  open_reports: number;
}

/**
 * The moderator queue. "open" lists oldest first (work through them in order);
 * "handled" lists most recently handled first.
 */
export async function listReports(actor: Actor | null, raw: unknown = {}, conn: Queryable = db) {
  requireRole(actor, "moderator");
  const q = reportsQuerySchema.parse(raw);
  const limit = clampLimit(q.limit, 20, 50);
  const cursor = decodeCursor(q.cursor);
  const open = q.status === "open";

  const params: unknown[] = [];
  const ph = (v: unknown) => (params.push(v), `$${params.length}`);
  const where = [open ? "r.status = 'open'" : "r.status <> 'open'"];
  const sortCol = open ? "r.created_at" : "r.handled_at";
  if (cursor) {
    if (typeof cursor.k !== "string" || !UUID_RE.test(cursor.id) || Number.isNaN(Date.parse(cursor.k))) {
      throw new AppError("VALIDATION", "Invalid cursor.", { fields: { cursor: "Invalid cursor" } });
    }
    where.push(`(${sortCol}, r.id) ${open ? ">" : "<"} (${ph(cursor.k)}::timestamptz, ${ph(cursor.id)}::uuid)`);
  }

  let fetched: ReportRow[];
  try {
    fetched = await rows<ReportRow>(
      `select r.id, r.status, r.reason, r.note,
              extract(epoch from (now() - r.created_at)) / 60 as age_minutes,
              to_char(${sortCol} at time zone 'UTC', ${ISO_US}) as sort_raw,
              rp.display_name as reporter_name, rp.username::text as reporter_username,
              hp.display_name as handler_name, r.resolution,
              case when r.post_id is not null then 'post' else 'comment' end as kind,
              coalesce(r.post_id, r.comment_id) as target_id,
              coalesce(r.post_id, c.post_id) as post_id,
              left(coalesce(p.body, c.body), 400) as text,
              (coalesce(p.status, c.status) = 'removed') as removed,
              (select count(*)::int from public.post_attachments a where a.post_id = coalesce(r.post_id, c.post_id) and r.post_id is not null) as attachments,
              tp.id as author_id, tp.display_name as author_name, tp.username::text as author_username, tp.role as author_role,
              (select count(*)::int from public.reports x
                 where x.status = 'open' and ((r.post_id is not null and x.post_id = r.post_id)
                                           or (r.comment_id is not null and x.comment_id = r.comment_id))) as open_reports
       from public.reports r
       join public.profiles rp on rp.id = r.reporter_id
       left join public.profiles hp on hp.id = r.handled_by
       left join public.posts p on p.id = r.post_id
       left join public.comments c on c.id = r.comment_id
       join public.profiles tp on tp.id = coalesce(p.author_id, c.author_id)
       where ${where.join(" and ")}
       order by ${sortCol} ${open ? "asc" : "desc"}, r.id ${open ? "asc" : "desc"}
       limit ${ph(limit + 1)}`,
      params,
      conn,
    );
  } catch (e) {
    if (PG_BAD_INPUT.has((e as { code?: string }).code ?? "")) throw new AppError("VALIDATION", "Invalid cursor.", { fields: { cursor: "Invalid cursor" } });
    throw e;
  }

  const hasMore = fetched.length > limit;
  const pageRows = hasMore ? fetched.slice(0, limit) : fetched;
  const last = pageRows[pageRows.length - 1];
  const items: ReportItem[] = pageRows.map((r) => ({
    id: r.id,
    status: r.status,
    reason: r.reason,
    note: r.note,
    ageMinutes: Number(r.age_minutes),
    reporter: { name: r.reporter_name, username: r.reporter_username },
    target: {
      kind: r.kind,
      id: r.target_id,
      postId: r.post_id,
      text: r.text,
      removed: r.removed,
      attachments: r.attachments,
      author: { id: r.author_id, name: r.author_name, username: r.author_username, role: r.author_role },
    },
    openReports: r.open_reports,
    ...(r.handler_name ? { handledBy: r.handler_name } : {}),
    ...(r.resolution ? { resolution: r.resolution } : {}),
  }));
  return { items, nextCursor: hasMore && last ? encodeCursor({ k: last.sort_raw, id: last.id }) : null };
}

export async function countOpenReports(actor: Actor | null, conn: Queryable = db): Promise<number> {
  requireRole(actor, "moderator");
  return (await one<{ n: number }>("select count(*) as n from public.reports where status = 'open'", [], conn))?.n ?? 0;
}

/**
 * "This content is fine": closes this report AND every other open report on the same
 * post/comment as dismissed (one decision per piece of content, not per reporter).
 */
export async function dismissReport(actor: Actor | null, rawId: string, raw: unknown = {}, conn: Queryable = db): Promise<{ closed: number }> {
  const a = requireRole(actor, "moderator");
  const id = uuidSchema.safeParse(rawId);
  if (!id.success) throw notFound("Report");
  const { resolution } = z.object({ resolution: z.string().trim().max(300).default("") }).parse(raw);

  return inTransaction(conn, async (c) => {
    const r = await one<{ post_id: string | null; comment_id: string | null; status: string }>(
      "select post_id, comment_id, status from public.reports where id = $1 for update",
      [id.data],
      c,
    );
    if (!r) throw notFound("Report");
    if (r.status !== "open") throw new AppError("CONFLICT", "That report has already been handled.");

    const closed = await c.query(
      `update public.reports set status = 'dismissed', handled_by = $1, handled_at = now(), resolution = nullif($2, '')
       where status = 'open' and ((post_id is not null and post_id = $3) or (comment_id is not null and comment_id = $4))`,
      [a.userId, resolution, r.post_id, r.comment_id],
    );
    await audit(c, {
      actorId: a.userId,
      action: "report.dismiss",
      entityType: "report",
      entityId: id.data,
      metadata: { postId: r.post_id, commentId: r.comment_id, closedReports: closed.rowCount ?? 0, resolution },
    });
    return { closed: closed.rowCount ?? 0 };
  });
}

/* ------------------------------------------------------------------------ */
/* Members (admins only)                                                     */
/* ------------------------------------------------------------------------ */

const userEmail = async (id: string, c: Queryable) =>
  (await one<{ email: string }>("select email::text as email from auth.users where id = $1", [id], c))?.email ?? null;

async function loadUser(userId: string, c: Queryable) {
  const parsed = uuidSchema.safeParse(userId);
  if (!parsed.success) throw notFound("Member");
  const u = await one<{ id: string; role: Role; status: "active" | "suspended"; username: string }>(
    "select id, role, status, username::text as username from public.profiles where id = $1 for update",
    [parsed.data],
    c,
  );
  if (!u) throw notFound("Member");
  return u;
}

/**
 * Suspends a member: they can't sign in or act (their profile status flips immediately,
 * and the sign-in itself is banned). Their existing posts stay visible; remove those
 * individually if needed. Admins can't be suspended (demote first), nor can you suspend yourself.
 */
export async function suspendUser(
  actor: Actor | null,
  userId: string,
  raw: unknown,
  conn: Queryable = db,
  auth: AuthAdmin = authAdmin,
): Promise<void> {
  const a = requireRole(actor, "admin");
  const { reason } = reasonSchema.parse(raw);

  await inTransaction(conn, async (c) => {
    const u = await loadUser(userId, c);
    if (u.id === a.userId) throw new AppError("VALIDATION", "You can't suspend yourself.");
    if (u.role === "admin") throw new AppError("FORBIDDEN", "Admins can't be suspended. Change their role first.");
    if (u.status === "suspended") throw new AppError("CONFLICT", "That member is already suspended.");

    await c.query("update public.profiles set status = 'suspended' where id = $1", [u.id]);
    await audit(c, { actorId: a.userId, action: "user.suspend", entityType: "user", entityId: u.id, metadata: { reason, username: u.username } });
    const to = await userEmail(u.id, c);
    if (to) await enqueueEmail(c, { to, template: "account_suspended", payload: { reason } });
    await auth.setBanned(u.id, true); // last: if this fails, everything above rolls back
  });
  await flushOutboxSoon(conn);
}

export async function unsuspendUser(
  actor: Actor | null,
  userId: string,
  conn: Queryable = db,
  auth: AuthAdmin = authAdmin,
): Promise<void> {
  const a = requireRole(actor, "admin");
  await inTransaction(conn, async (c) => {
    const u = await loadUser(userId, c);
    if (u.status !== "suspended") throw new AppError("CONFLICT", "That member isn't suspended.");
    await c.query("update public.profiles set status = 'active' where id = $1", [u.id]);
    await audit(c, { actorId: a.userId, action: "user.unsuspend", entityType: "user", entityId: u.id, metadata: { username: u.username } });
    const to = await userEmail(u.id, c);
    if (to) await enqueueEmail(c, { to, template: "account_reinstated", payload: { loginUrl: `${getEnv().APP_URL}/signin` } });
    await auth.setBanned(u.id, false);
  });
  await flushOutboxSoon(conn);
}

/** Promote or demote a member. You can't change your own role (so the last admin can't lock everyone out). */
export async function setRole(actor: Actor | null, userId: string, raw: unknown, conn: Queryable = db): Promise<void> {
  const a = requireRole(actor, "admin");
  const { role } = z.object({ role: z.enum(["member", "moderator", "admin"]) }).parse(raw);

  await inTransaction(conn, async (c) => {
    const u = await loadUser(userId, c);
    if (u.id === a.userId) throw new AppError("VALIDATION", "You can't change your own role.");
    if (u.role === role) return;
    await c.query("update public.profiles set role = $2 where id = $1", [u.id, role]);
    await audit(c, {
      actorId: a.userId,
      action: "user.set_role",
      entityType: "user",
      entityId: u.id,
      metadata: { from: u.role, to: role, username: u.username },
    });
    const to = await userEmail(u.id, c);
    if (to) await enqueueEmail(c, { to, template: "role_changed", payload: { role } });
  });
  await flushOutboxSoon(conn);
}
