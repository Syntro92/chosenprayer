import "server-only";
import { pageQuerySchema, uuidSchema } from "@/lib/schemas/community";
import type { Notification, NotificationsPage } from "@/lib/community/types";
import { requireMember, type Actor } from "../auth/policy";
import { db, one, rows, type Queryable } from "../db";
import { AppError } from "../errors";
import { clampLimit } from "../pagination";

export type NotificationType = "comment" | "reply" | "like" | "blessing" | "donation" | "moderation" | "system";

/**
 * Creates a notification for `userId`. Called by other services INSIDE their transaction,
 * so a notification exists exactly when the thing it describes does.
 *
 * Quietly does nothing when there is no one to tell: yourself, a suspended or deleted
 * account, or (for likes) the same person already got the same message in the last day,
 * so liking and unliking repeatedly can't spam someone.
 */
export async function notify(
  conn: Queryable,
  n: { userId: string; actorId?: string | null; type: NotificationType; text: string; href?: string },
): Promise<void> {
  if (n.actorId && n.actorId === n.userId) return;
  await conn.query(
    `insert into public.notifications (user_id, actor_id, type, text, href)
     select p.id, $2, $3::public.notification_type, left($4, 300), $5
     from public.profiles p
     where p.id = $1 and p.status = 'active'
       and not ($3 = 'like' and exists (
         select 1 from public.notifications x
         where x.user_id = $1 and x.actor_id is not distinct from $2 and x.type = 'like'
           and x.href is not distinct from $5 and x.created_at > now() - interval '1 day'))`,
    [n.userId, n.actorId ?? null, n.type, n.text, n.href ?? null],
  );
}

interface NotificationRow {
  id: string;
  text: string;
  href: string | null;
  read: boolean;
  age_minutes: number;
}

const toNotification = (r: NotificationRow): Notification => ({
  id: r.id,
  text: r.text,
  href: r.href ?? undefined,
  read: r.read,
  ageMinutes: Number(r.age_minutes),
});

/** The signed-in member's latest notifications plus their unread count. */
export async function listNotifications(actor: Actor | null, raw: unknown = {}, conn: Queryable = db): Promise<NotificationsPage> {
  const a = requireMember(actor);
  const { limit } = pageQuerySchema.parse(raw);
  const items = await rows<NotificationRow>(
    `select id, text, href, read_at is not null as read,
            extract(epoch from (now() - created_at)) / 60 as age_minutes
     from public.notifications where user_id = $1
     order by created_at desc, id desc limit $2`,
    [a.userId, clampLimit(limit, 10, 30)],
    conn,
  );
  const unread = await one<{ n: number }>("select count(*) as n from public.notifications where user_id = $1 and read_at is null", [a.userId], conn);
  return { items: items.map(toNotification), unread: unread?.n ?? 0 };
}

/** Marks the given notifications (or all of them) as read. Only ever touches the caller's own. */
export async function markNotificationsRead(actor: Actor | null, ids: string[] | "all", conn: Queryable = db): Promise<{ unread: number }> {
  const a = requireMember(actor);
  if (ids === "all") {
    await conn.query("update public.notifications set read_at = now() where user_id = $1 and read_at is null", [a.userId]);
  } else {
    if (ids.length > 100) throw new AppError("VALIDATION", "Too many notifications.");
    const valid = ids.filter((id) => uuidSchema.safeParse(id).success);
    if (valid.length) {
      await conn.query(
        "update public.notifications set read_at = now() where user_id = $1 and read_at is null and id = any($2::uuid[])",
        [a.userId, valid],
      );
    }
  }
  const unread = await one<{ n: number }>("select count(*) as n from public.notifications where user_id = $1 and read_at is null", [a.userId], conn);
  return { unread: unread?.n ?? 0 };
}
