import "server-only";
import { adminTransactionListSchema } from "@/lib/schemas/admin";
import { safeReceiptUrl } from "@/lib/giving";
import { uuidSchema } from "@/lib/schemas/community";
import { requireRole, type Actor } from "../auth/policy";
import { db, one, rows, type Queryable } from "../db";
import { AppError } from "../errors";
import { likePattern, UUID_RE } from "./community-shared";
import type { AdminPage } from "./admin-channels";

export interface AdminTransaction {
  id: string;
  donor: { name: string; email: string | null; userId: string | null; guest: boolean };
  channel: { id: string; handle: string; name: string };
  amountCents: number;
  feeCents: number;
  currency: string;
  frequency: "once" | "monthly";
  status: "pending" | "succeeded" | "failed" | "refunded" | "canceled";
  source: string;
  provider: string;
  createdAt: string;
  paidAt: string | null;
}

export interface AdminTransactionDetail extends AdminTransaction {
  providerPaymentId: string | null;
  providerSubscriptionId: string | null;
  subscriptionId: string | null;
  failureReason: string | null;
  refundedAt: string | null;
  receiptSentAt: string | null;
  /** Stripe-hosted receipt page, when there is one. */
  receiptUrl: string | null;
  blessing: { message: string; displayName: string | null } | null;
  refund: { reason: string | null; by: string | null; at: string } | null;
}

interface Row {
  id: string; donor_id: string | null; donor_name: string | null; donor_email: string | null; profile_name: string | null;
  channel_id: string; channel_handle: string; channel_name: string;
  amount_cents: number; fee_cents: number; currency: string; frequency: "once" | "monthly"; status: AdminTransaction["status"];
  source: string; provider: string; created_at: string; paid_at: string | null;
  provider_payment_id?: string | null; provider_subscription_id?: string | null; subscription_id?: string | null;
  failure_reason?: string | null; refunded_at?: string | null; receipt_sent_at?: string | null; receipt_url?: string | null;
}

const iso = (v: string | null | undefined) => (v ? new Date(v).toISOString() : null);

const SELECT = `
  select d.id, d.donor_id, d.donor_name, d.donor_email::text as donor_email, p.display_name as profile_name,
         d.channel_id, c.handle::text as channel_handle, c.name as channel_name,
         d.amount_cents, d.fee_cents, d.currency::text as currency, d.frequency::text as frequency, d.status::text as status,
         d.source::text as source, d.provider, d.created_at::text as created_at, d.paid_at::text as paid_at,
         d.provider_payment_id, d.provider_subscription_id, d.subscription_id, d.failure_reason,
         d.refunded_at::text as refunded_at, d.receipt_sent_at::text as receipt_sent_at, d.receipt_url
  from public.donations d
  join public.channels c on c.id = d.channel_id
  left join public.profiles p on p.id = d.donor_id`;

const toTransaction = (r: Row): AdminTransaction => ({
  id: r.id,
  donor: {
    name: r.profile_name ?? r.donor_name ?? "Anonymous donor",
    email: r.donor_email,
    userId: r.donor_id,
    guest: !r.donor_id,
  },
  channel: { id: r.channel_id, handle: r.channel_handle, name: r.channel_name },
  amountCents: r.amount_cents,
  feeCents: r.fee_cents,
  currency: r.currency,
  frequency: r.frequency,
  status: r.status,
  source: r.source,
  provider: r.provider,
  createdAt: iso(r.created_at)!,
  paidAt: iso(r.paid_at),
});

export async function listAdminTransactions(actor: Actor | null, raw: unknown, conn: Queryable = db): Promise<AdminPage<AdminTransaction>> {
  requireRole(actor, "admin");
  const q = adminTransactionListSchema.parse(raw);
  const params: unknown[] = [];
  const where: string[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace("?", `$${params.length}`));
  };
  if (q.status) add("d.status = ?::public.donation_status", q.status);
  if (q.source) add("d.source = ?::public.donation_source", q.source);
  if (q.channel) add("c.handle = ?", q.channel);
  if (q.from) add("d.created_at >= ?::date", q.from);
  if (q.to) add("d.created_at < (?::date + 1)", q.to);
  if (q.q) {
    if (UUID_RE.test(q.q)) add("d.id = ?::uuid", q.q);
    else {
      params.push(likePattern(q.q));
      const n = params.length;
      where.push(`(d.donor_name ilike $${n} or d.donor_email::text ilike $${n} or p.display_name ilike $${n} or c.name ilike $${n})`);
    }
  }
  const clause = where.length ? `where ${where.join(" and ")}` : "";
  const from = `from public.donations d join public.channels c on c.id = d.channel_id left join public.profiles p on p.id = d.donor_id ${clause}`;
  const total = (await one<{ n: number }>(`select count(*)::int as n ${from}`, params, conn))!.n;
  params.push(q.pageSize, (q.page - 1) * q.pageSize);
  const list = await rows<Row>(
    `${SELECT} ${clause} order by d.created_at desc, d.id limit $${params.length - 1} offset $${params.length}`,
    params,
    conn,
  );
  return { items: list.map(toTransaction), total, page: q.page, pageSize: q.pageSize };
}

export async function getAdminTransaction(actor: Actor | null, rawId: string, conn: Queryable = db): Promise<AdminTransactionDetail> {
  requireRole(actor, "admin");
  const id = uuidSchema.safeParse(rawId);
  if (!id.success) throw new AppError("NOT_FOUND", "Transaction not found.");
  const r = await one<Row>(`${SELECT} where d.id = $1`, [id.data], conn);
  if (!r) throw new AppError("NOT_FOUND", "Transaction not found.");

  const blessing = await one<{ message: string; display_name: string | null }>(
    "select message, display_name from public.blessings where donation_id = $1",
    [id.data],
    conn,
  );
  const refund = await one<{ reason: string | null; by: string | null; at: string }>(
    `select a.metadata->>'reason' as reason, p.display_name as by, a.created_at::text as at
     from public.audit_log a left join public.profiles p on p.id = a.actor_id
     where a.action = 'donation.refund' and a.entity_id = $1 order by a.id desc limit 1`,
    [id.data],
    conn,
  );
  return {
    ...toTransaction(r),
    providerPaymentId: r.provider_payment_id ?? null,
    providerSubscriptionId: r.provider_subscription_id ?? null,
    subscriptionId: r.subscription_id ?? null,
    failureReason: r.failure_reason ?? null,
    refundedAt: iso(r.refunded_at),
    receiptSentAt: iso(r.receipt_sent_at),
    receiptUrl: safeReceiptUrl(r.receipt_url),
    blessing: blessing ? { message: blessing.message, displayName: blessing.display_name } : null,
    refund: refund ? { reason: refund.reason, by: refund.by, at: new Date(refund.at).toISOString() } : null,
  };
}
