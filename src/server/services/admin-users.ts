import "server-only";
import { adminUserListSchema, createUserSchema, updateUserSchema } from "@/lib/schemas/admin";
import { uuidSchema } from "@/lib/schemas/community";
import { authAdmin, authProvisioner, type AuthAdmin, type AuthProvisioner } from "../auth/auth-admin";
import { requireRole, type Actor, type AccountStatus, type Role } from "../auth/policy";
import { db, inTransaction, one, rows, type Queryable } from "../db";
import { AppError } from "../errors";
import type { AdminPage } from "./admin-channels";
import { getEnv } from "../env";
import { audit } from "./audit";
import { enqueueEmail, flushOutboxSoon } from "./email";
import { likePattern, UUID_RE } from "./community-shared";
import { setRole, suspendUser, unsuspendUser } from "./moderation";

export interface AdminUser {
  id: string;
  name: string;
  username: string;
  /** From the auth system. Only ever returned to admins. */
  email: string | null;
  role: Role;
  status: AccountStatus;
  verified: boolean;
  joinedAt: string;
  lastSignInAt: string | null;
}

export interface AdminUserDetail extends AdminUser {
  bio: string;
  stats: { posts: number; comments: number; donations: number; givenCents: number; reportsAgainst: number };
  /** Most recent admin actions taken on this account. */
  history: { action: string; at: string; by: string | null; metadata: Record<string, unknown> }[];
}

interface Row {
  id: string; display_name: string; username: string; email: string | null; role: Role; status: AccountStatus;
  verified: boolean; created_at: string; last_sign_in_at: string | null; bio?: string;
}

const SELECT = `
  select p.id, p.display_name, p.username::text as username, u.email::text as email, p.role::text as role, p.status::text as status,
         p.verified, p.created_at::text as created_at, u.last_sign_in_at::text as last_sign_in_at, p.bio
  from public.profiles p join auth.users u on u.id = p.id`;

const iso = (v: string | null) => (v ? new Date(v).toISOString() : null);
const toUser = (r: Row): AdminUser => ({
  id: r.id,
  name: r.display_name,
  username: r.username,
  email: r.email,
  role: r.role,
  status: r.status,
  verified: r.verified,
  joinedAt: iso(r.created_at)!,
  lastSignInAt: iso(r.last_sign_in_at),
});

const notFound = () => new AppError("NOT_FOUND", "User not found.");

export async function listAdminUsers(actor: Actor | null, raw: unknown, conn: Queryable = db): Promise<AdminPage<AdminUser>> {
  requireRole(actor, "admin");
  const q = adminUserListSchema.parse(raw);
  const params: unknown[] = [];
  const where: string[] = [];
  if (q.role) {
    params.push(q.role);
    where.push(`p.role = $${params.length}::public.user_role`);
  }
  if (q.status) {
    params.push(q.status);
    where.push(`p.status = $${params.length}::public.account_status`);
  }
  if (q.q) {
    if (UUID_RE.test(q.q)) {
      params.push(q.q);
      where.push(`p.id = $${params.length}::uuid`);
    } else {
      params.push(likePattern(q.q));
      const n = params.length;
      where.push(`(p.display_name ilike $${n} or p.username::text ilike $${n} or u.email::text ilike $${n})`);
    }
  }
  const clause = where.length ? `where ${where.join(" and ")}` : "";
  const total = (await one<{ n: number }>(`select count(*)::int as n from public.profiles p join auth.users u on u.id = p.id ${clause}`, params, conn))!.n;
  params.push(q.pageSize, (q.page - 1) * q.pageSize);
  const list = await rows<Row>(
    `${SELECT} ${clause} order by p.created_at desc, p.id limit $${params.length - 1} offset $${params.length}`,
    params,
    conn,
  );
  return { items: list.map(toUser), total, page: q.page, pageSize: q.pageSize };
}

export async function getAdminUser(actor: Actor | null, rawId: string, conn: Queryable = db): Promise<AdminUserDetail> {
  requireRole(actor, "admin");
  const id = uuidSchema.safeParse(rawId);
  if (!id.success) throw notFound();
  const r = await one<Row>(`${SELECT} where p.id = $1`, [id.data], conn);
  if (!r) throw notFound();

  const stats = (await one<{ posts: number; comments: number; donations: number; given: number; reports: number }>(
    `select (select count(*)::int from public.posts where author_id = $1) as posts,
            (select count(*)::int from public.comments where author_id = $1) as comments,
            (select count(*)::int from public.donations where donor_id = $1 and status = 'succeeded') as donations,
            (select coalesce(sum(amount_cents), 0)::bigint from public.donations where donor_id = $1 and status = 'succeeded') as given,
            (select count(*)::int from public.reports rp
               left join public.posts po on po.id = rp.post_id
               left join public.comments co on co.id = rp.comment_id
             where po.author_id = $1 or co.author_id = $1) as reports`,
    [id.data],
    conn,
  ))!;
  const history = await rows<{ action: string; at: string; by: string | null; metadata: Record<string, unknown> }>(
    `select a.action, a.created_at::text as at, p.display_name as by, a.metadata
     from public.audit_log a left join public.profiles p on p.id = a.actor_id
     where a.entity_type = 'user' and a.entity_id = $1 order by a.id desc limit 20`,
    [id.data],
    conn,
  );
  return {
    ...toUser(r),
    bio: r.bio ?? "",
    stats: { posts: stats.posts, comments: stats.comments, donations: stats.donations, givenCents: stats.given, reportsAgainst: stats.reports },
    history: history.map((h) => ({ action: h.action, at: new Date(h.at).toISOString(), by: h.by, metadata: h.metadata })),
  };
}

/**
 * Admin creates an account directly and picks its role. Only `admin` accounts can open the
 * dashboard, so this is how new admins are made. The profile row is created by the auth trigger;
 * the role is then set on it and audited like any other role change.
 */
export async function createAdminUser(
  actor: Actor | null,
  raw: unknown,
  conn: Queryable = db,
  provisioner: AuthProvisioner = authProvisioner,
): Promise<AdminUserDetail> {
  const a = requireRole(actor, "admin");
  const input = createUserSchema.parse(raw);
  const { id } = await provisioner.createUser({ email: input.email, password: input.password, fullName: input.fullName });
  await inTransaction(conn, async (c) => {
    await c.query("update public.profiles set role = $2::public.user_role, must_change_password = true where id = $1", [id, input.role]);
    await audit(c, {
      actorId: a.userId,
      action: "user.create",
      entityType: "user",
      entityId: id,
      metadata: { role: input.role, email: input.email },
    });
    // No password in the email: the admin who chose it hands it over separately.
    await enqueueEmail(c, {
      to: input.email,
      template: "account_created",
      payload: { name: input.fullName, role: input.role, loginUrl: `${getEnv().APP_URL}/signin` },
    });
  });
  await flushOutboxSoon(conn);
  return getAdminUser(a, id, conn);
}

/**
 * Role, suspension and verified badge, in one call. Each part reuses the audited moderation
 * services, so the safety rules (no self-demotion, admins can't be suspended, a real Supabase
 * ban on suspend) are enforced in exactly one place. Parts are applied in order and a failure
 * stops the rest, so the caller always sees the first problem.
 */
export async function updateAdminUser(
  actor: Actor | null,
  rawId: string,
  raw: unknown,
  conn: Queryable = db,
  auth: AuthAdmin = authAdmin,
): Promise<AdminUserDetail> {
  const a = requireRole(actor, "admin");
  const id = uuidSchema.safeParse(rawId);
  if (!id.success) throw notFound();
  const patch = updateUserSchema.parse(raw);

  const current = await one<{ role: Role; status: AccountStatus; verified: boolean }>(
    "select role::text as role, status::text as status, verified from public.profiles where id = $1",
    [id.data],
    conn,
  );
  if (!current) throw notFound();

  if (patch.status === "suspended" && current.status !== "suspended" && !patch.reason?.trim()) {
    throw new AppError("VALIDATION", "Please give a reason for the suspension.", { fields: { reason: "Required when suspending" } });
  }
  if (patch.role !== undefined && patch.role !== current.role) await setRole(a, id.data, { role: patch.role }, conn);
  if (patch.status === "suspended" && current.status !== "suspended") await suspendUser(a, id.data, { reason: patch.reason }, conn, auth);
  if (patch.status === "active" && current.status !== "active") await unsuspendUser(a, id.data, conn, auth);

  if (patch.verified !== undefined && patch.verified !== current.verified) {
    await inTransaction(conn, async (c) => {
      await c.query("update public.profiles set verified = $2 where id = $1", [id.data, patch.verified]);
      await audit(c, { actorId: a.userId, action: "user.verify", entityType: "user", entityId: id.data, metadata: { verified: patch.verified } });
    });
  }
  return getAdminUser(a, id.data, conn);
}
