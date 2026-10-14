import { randomUUID } from "node:crypto";
import type { Actor } from "@/server/auth/policy";
import { RATE_LIMITS, type RateLimitName } from "@/server/rate-limit";
import type { Queryable } from "@/server/db";
import type { CheckoutParams, PaymentProvider } from "@/server/providers/payments";
import type { Storage } from "@/server/storage";

/** Creates a member (auth user + auto-created profile) inside the caller's transaction. */
export async function member(
  c: Queryable,
  opts: { status?: "active" | "suspended"; role?: "member" | "moderator" | "admin"; name?: string } = {},
): Promise<Actor> {
  const id = randomUUID();
  await c.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [
    id,
    `t${id.slice(0, 8)}@example.com`,
    JSON.stringify({ full_name: opts.name ?? "Test Member" }),
  ]);
  if (opts.status || opts.role) {
    await c.query("update public.profiles set status = coalesce($2::public.account_status, status), role = coalesce($3::public.user_role, role) where id = $1", [
      id,
      opts.status ?? null,
      opts.role ?? null,
    ]);
  }
  const { rows } = await c.query<{ username: string; display_name: string }>("select username, display_name from public.profiles where id = $1", [id]);
  return {
    userId: id,
    username: rows[0].username,
    displayName: rows[0].display_name,
    role: opts.role ?? "member",
    status: opts.status ?? "active",
  };
}

/** In-memory stand-in for Supabase Storage. */
export class FakeStorage implements Storage {
  removed: string[] = [];
  async createUploadTarget(path: string) {
    return { path, token: `tok-${path}` };
  }
  async signedUrls(paths: string[]) {
    return new Map(paths.map((p) => [p, `https://signed.example/${p}?token=abc`]));
  }
  async remove(paths: string[]) {
    this.removed.push(...paths);
  }
}

/** Pretends a file finished uploading, the way Storage would record it. */
export async function putObject(c: Queryable, key: string, size: number, mimetype: string) {
  await c.query(
    "insert into storage.objects (bucket_id, name, metadata) values ('community-attachments', $1, $2::jsonb)",
    [key, JSON.stringify({ size, mimetype })],
  );
}

export const key = (userId: string, ext = "png") => `posts/${userId}/${randomUUID()}.${ext}`;

/** Puts `identifier` exactly at its limit for `name` in one statement (instead of N round trips). */
export async function saturate(c: Queryable, name: RateLimitName, identifier: string) {
  const rule = RATE_LIMITS[name];
  await c.query(
    `insert into public.rate_limits (key, window_start, count)
     values ($1, to_timestamp(floor(extract(epoch from now()) / $2) * $2), $3)
     on conflict (key, window_start) do update set count = excluded.count`,
    [`${name}:${identifier}`, rule.windowSeconds, rule.limit],
  );
}

/** An active channel (optionally owned) created inside the caller's transaction. */
export async function channel(
  c: Queryable,
  opts: { ownerId?: string | null; status?: string; currency?: string; name?: string } = {},
) {
  const handle = `g_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const { rows } = await c.query<{ id: string }>(
    `insert into public.channels (handle, name, category, status, owner_id, currency)
     values ($1, $2, 'faith', $3, $4, $5) returning id`,
    [handle, opts.name ?? "Giving Test Channel", opts.status ?? "active", opts.ownerId ?? null, opts.currency ?? "USD"],
  );
  return { id: rows[0].id, handle, name: opts.name ?? "Giving Test Channel" };
}

/** A recording payment provider; can be told to fail. */
export class FakeProvider implements PaymentProvider {
  readonly name = "mock" as const;
  checkouts: CheckoutParams[] = [];
  resumed: string[] = [];
  canceled: string[] = [];
  refunded: string[] = [];
  failCheckout = false;
  failRefund = false;
  failCancel = false;
  async createCheckout(p: CheckoutParams) {
    if (this.failCheckout) throw new Error("provider is down");
    this.checkouts.push(p);
    const id = randomUUID();
    return {
      providerPaymentId: `pi_${id}`,
      clientSecret: `secret_${id}`,
      providerCustomerId: `cus_${id.slice(0, 8)}`,
      ...(p.frequency === "monthly" ? { providerSubscriptionId: `sub_${id}` } : {}),
    };
  }
  async resumeCheckout(providerPaymentId: string) {
    this.resumed.push(providerPaymentId);
    return { clientSecret: `resumed_${providerPaymentId}` };
  }
  async cancelSubscription(id: string) {
    if (this.failCancel) throw new Error("cancel failed");
    this.canceled.push(id);
  }
  async refund(id: string) {
    if (this.failRefund) throw new Error("refund failed");
    this.refunded.push(id);
    return { refundId: `re_${id}` };
  }
}

/** An email sender that records (or fails) instead of sending. */
export class FakeSender {
  readonly name = "console" as const;
  sent: { to: string; subject: string; text: string; html: string }[] = [];
  failWith: Error | null = null;
  async send(m: { to: string; subject: string; text: string; html: string }) {
    if (this.failWith) throw this.failWith;
    this.sent.push(m);
  }
}
