import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import type { AuthAdmin } from "@/server/auth/auth-admin";
import type { Actor } from "@/server/auth/policy";
import { createAdminClient } from "@/server/auth/supabase";
import { db, getPool, one } from "@/server/db";
import { getEnv } from "@/server/env";
import * as accounts from "@/server/services/accounts";
import { suspendUser, unsuspendUser } from "@/server/services/moderation";

/**
 * Against REAL Supabase Auth + Postgres (committed rows, no rollback): proves that
 * suspending is atomic and that a suspended member genuinely cannot sign in.
 */

const env = getEnv();
const admin = createAdminClient();
const PASSWORD = "Correct-horse-9";
const users: string[] = [];
const rateKeys: string[] = [];

async function realUser(role: "member" | "admin" = "member"): Promise<{ actor: Actor; email: string }> {
  const email = `mod+${randomUUID().slice(0, 10)}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "Real User" } });
  if (error) throw error;
  users.push(data.user.id);
  if (role !== "member") await db.query("update public.profiles set role = $2 where id = $1", [data.user.id, role]);
  const p = await one<{ username: string }>("select username from public.profiles where id = $1", [data.user.id]);
  rateKeys.push(`signin:${data.user.id}`);
  return { email, actor: { userId: data.user.id, username: p!.username, displayName: "Real User", role, status: "active" } };
}

const browser = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

afterAll(async () => {
  for (const id of users) {
    await db.query("delete from public.audit_log where entity_id = $1::text or actor_id = $1::uuid", [id]);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  await db.query("delete from public.rate_limits");
  await getPool().end();
});

describe("suspension against real Supabase", () => {
  it("is atomic: if the sign-in ban fails, the member stays active and nothing is logged", async () => {
    const { actor: boss } = await realUser("admin");
    const { actor: target } = await realUser();
    const failing: AuthAdmin = {
      async setBanned() {
        throw new Error("auth service down");
      },
    };
    await expect(suspendUser(boss, target.userId, { reason: "testing" }, db, failing)).rejects.toThrow("auth service down");
    expect((await one<{ status: string }>("select status from public.profiles where id = $1", [target.userId]))?.status).toBe("active");
    expect(await one("select 1 from public.audit_log where entity_id = $1", [target.userId])).toBeNull();
  });

  it("a suspended member can't sign in, and can again once unsuspended", async () => {
    const { actor: boss } = await realUser("admin");
    const { actor: target, email } = await realUser();
    const ctx = () => ({ supabase: browser(), ip: `test-${randomUUID()}` });

    await expect(accounts.signIn(ctx(), { email, password: PASSWORD })).resolves.toMatchObject({ userId: target.userId });

    await suspendUser(boss, target.userId, { reason: "Repeated harassment" }); // real ban call
    expect((await one<{ status: string }>("select status from public.profiles where id = $1", [target.userId]))?.status).toBe("suspended");
    await expect(accounts.signIn(ctx(), { email, password: PASSWORD })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await unsuspendUser(boss, target.userId);
    expect((await one<{ status: string }>("select status from public.profiles where id = $1", [target.userId]))?.status).toBe("active");
    await expect(accounts.signIn(ctx(), { email, password: PASSWORD })).resolves.toMatchObject({ userId: target.userId });

    const log = await db.query("select action from public.audit_log where entity_id = $1 order by id", [target.userId]);
    expect(log.rows.map((r) => r.action)).toEqual(["user.suspend", "user.unsuspend"]);
  });
});
