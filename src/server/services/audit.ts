import "server-only";
import { requireRole, type Actor } from "../auth/policy";
import { db, rows, type Queryable } from "../db";
import { AppError } from "../errors";
import { clampLimit, decodeCursor, toPage, type Page } from "../pagination";
import { ISO_US } from "./community-shared";

export type AuditAction =
  | "post.remove"
  | "post.pin"
  | "post.unpin"
  | "comment.remove"
  | "report.dismiss"
  | "user.create"
  | "user.suspend"
  | "user.unsuspend"
  | "user.set_role"
  | "user.verify"
  | "donation.refund"
  | "channel.create"
  | "channel.update"
  | "channel.status"
  | "setting.update";

/**
 * Appends to the audit trail. Always called INSIDE the transaction of the action it
 * describes, so a logged action really happened and a rolled-back one leaves no trace.
 */
export async function audit(
  conn: Queryable,
  entry: { actorId: string | null; action: AuditAction; entityType: "post" | "comment" | "report" | "user" | "donation" | "channel" | "setting"; entityId: string; metadata?: Record<string, unknown> },
): Promise<void> {
  await conn.query(
    "insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata) values ($1, $2, $3, $4, $5)",
    [entry.actorId, entry.action, entry.entityType, entry.entityId, JSON.stringify(entry.metadata ?? {})],
  );
}

export interface AuditEntry {
  id: number;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: { name: string; username: string } | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/** Newest first. Admins only. */
export async function listAuditLog(
  actor: Actor | null,
  opts: { cursor?: string; limit?: number; entityType?: string } = {},
  conn: Queryable = db,
): Promise<Page<AuditEntry>> {
  requireRole(actor, "admin");
  const limit = clampLimit(opts.limit, 30, 100);
  const cursor = decodeCursor(opts.cursor);
  const params: unknown[] = [];
  const where: string[] = [];
  if (opts.entityType) {
    params.push(opts.entityType);
    where.push(`a.entity_type = $${params.length}`);
  }
  if (cursor) {
    if (typeof cursor.k !== "number" || !Number.isInteger(cursor.k)) throw new AppError("VALIDATION", "Invalid cursor.");
    params.push(cursor.k);
    where.push(`a.id < $${params.length}`);
  }
  params.push(limit + 1);
  const fetched = await rows<{
    id: number; action: string; entity_type: string; entity_id: string | null; metadata: Record<string, unknown>;
    created_raw: string; name: string | null; username: string | null;
  }>(
    `select a.id, a.action, a.entity_type, a.entity_id, a.metadata,
            to_char(a.created_at at time zone 'UTC', ${ISO_US}) as created_raw,
            p.display_name as name, p.username::text as username
     from public.audit_log a left join public.profiles p on p.id = a.actor_id
     ${where.length ? `where ${where.join(" and ")}` : ""}
     order by a.id desc limit $${params.length}`,
    params,
    conn,
  );
  const page = toPage(fetched, limit, (r) => ({ k: r.id, id: String(r.id) }));
  return {
    nextCursor: page.nextCursor,
    items: page.items.map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      actor: r.name ? { name: r.name, username: r.username! } : null,
      metadata: r.metadata,
      createdAt: r.created_raw,
    })),
  };
}
