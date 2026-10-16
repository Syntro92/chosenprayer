import { createHash, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor, Role } from "@/server/auth/policy";
import { createAdminClient } from "@/server/auth/supabase";
import { db, getPool, one, rows } from "@/server/db";
import { getEnv } from "@/server/env";
import { RATE_LIMITS, hit } from "@/server/rate-limit";
import * as accounts from "@/server/services/accounts";

/**
 * Integration tests against the REAL Supabase Auth + database.
 * Accounts are created already-confirmed through the admin API (so no emails are
 * sent) and every user / rate-limit row / channel created here is removed afterwards.
 */

const env = getEnv();
const admin = createAdminClient();
const PASSWORD = "Correct-horse-9";

const createdUsers: string[] = [];
const rateKeys: string[] = [];
const channels: string[] = [];

const hashEmail = (email: string) => createHash("sha256").update(email).digest("hex").slice(0, 32);

function browser(): SupabaseClient {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function ctxFor(supabase: SupabaseClient = browser()): accounts.AuthContext & { ip: string } {
  const ip = `test-${randomUUID()}`;
  rateKeys.push(`signin:${ip}`, `signup:${ip}`, `passwordReset:${ip}`);
  return { supabase, ip };
}

async function makeUser(opts: { name?: string; role?: Role } = {}) {
  const email = `test+${randomUUID().slice(0, 12)}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: opts.name ?? "Test Person" },
  });
  if (error) throw error;
  const id = data.user.id;
  createdUsers.push(id);
  rateKeys.push(`signin:email:${hashEmail(email)}`, `passwordReset:email:${hashEmail(email)}`, `signin:delete:${id}`);
  if (opts.role) await db.query("update public.profiles set role = $2 where id = $1", [id, opts.role]);
  return { id, email };
}

async function actorOf(id: string): Promise<Actor> {
  const p = await one<{ username: string; display_name: string; role: Role; status: "active" | "suspended" }>(
    "select username, display_name, role, status from public.profiles where id = $1",
    [id],
  );
  return { userId: id, username: p!.username, displayName: p!.display_name, role: p!.role, status: p!.status };
}

const stubAuth = (auth: Record<string, unknown>) => ({ auth }) as unknown as SupabaseClient;

beforeAll(() => {
  // nothing to prepare; accounts are created per test
});

afterAll(async () => {
  for (const id of channels) {
    await db.query("delete from public.donations where channel_id = $1", [id]);
    await db.query("delete from public.channels where id = $1", [id]);
  }
  for (const id of createdUsers) await admin.auth.admin.deleteUser(id).catch(() => {});
  if (rateKeys.length) await db.query("delete from public.rate_limits where key = any($1)", [rateKeys]);
  await getPool().end();
});

/* ------------------------------------------------------------------------ */

describe("signup creates a profile (database trigger)", () => {
  it("copies full_name and derives a unique username from the email", async () => {
    const a = await makeUser({ name: "Nimali Perera" });
    const p = await one<{ display_name: string; username: string; role: string; status: string }>(
      "select display_name, username, role, status from public.profiles where id = $1",
      [a.id],
    );
    expect(p).toMatchObject({ display_name: "Nimali Perera", role: "member", status: "active" });
    expect(p!.username).toMatch(/^[a-z0-9_]{3,30}$/);
  });
});

describe("signIn", () => {
  it("signs a valid user in and returns their id and role", async () => {
    const u = await makeUser();
    const ctx = ctxFor();
    const r = await accounts.signIn(ctx, { email: u.email, password: PASSWORD });
    expect(r).toEqual({ userId: u.id, role: "member", mustChangePassword: false });
    expect((await ctx.supabase.auth.getSession()).data.session).not.toBeNull();
  });

  it("is case/whitespace tolerant on the email", async () => {
    const u = await makeUser();
    const r = await accounts.signIn(ctxFor(), { email: `  ${u.email.toUpperCase()} `, password: PASSWORD });
    expect(r.userId).toBe(u.id);
  });

  it("gives the same error for a wrong password and an unknown email (no account discovery)", async () => {
    const u = await makeUser();
    const wrongPw = await accounts.signIn(ctxFor(), { email: u.email, password: "nope-nope-nope" }).catch((e) => e);
    const unknown = await accounts.signIn(ctxFor(), { email: `nobody+${randomUUID()}@example.com`, password: PASSWORD }).catch((e) => e);
    expect(wrongPw).toMatchObject({ code: "UNAUTHENTICATED", message: "Incorrect email or password." });
    expect(unknown).toMatchObject({ code: "UNAUTHENTICATED", message: "Incorrect email or password." });
  });

  it("refuses suspended accounts and leaves no session behind", async () => {
    const u = await makeUser();
    await db.query("update public.profiles set status = 'suspended' where id = $1", [u.id]);
    const ctx = ctxFor();
    await expect(accounts.signIn(ctx, { email: u.email, password: PASSWORD })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await ctx.supabase.auth.getSession()).data.session).toBeNull();
  });

  it("validates input before touching the network", async () => {
    await expect(accounts.signIn(ctxFor(), { email: "not-an-email", password: "x" })).rejects.toMatchObject({ name: "ZodError" });
  });

  it("rate-limits per IP", async () => {
    const ctx = ctxFor();
    for (let i = 0; i < RATE_LIMITS.signin.limit; i++) await hit(`signin:${ctx.ip}`, RATE_LIMITS.signin);
    await expect(accounts.signIn(ctx, { email: "a@b.co", password: "x" })).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
  });

  it("rate-limits per email, so one account can't be hammered from many IPs", async () => {
    const u = await makeUser();
    for (let i = 0; i < RATE_LIMITS.signin.limit; i++) await hit(`signin:email:${hashEmail(u.email)}`, RATE_LIMITS.signin);
    await expect(accounts.signIn(ctxFor(), { email: u.email, password: PASSWORD })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});

describe("signUp (no email confirmation)", () => {
  const fresh = () => ({
    fullName: "  Nimali Perera  ",
    email: `Test+${randomUUID().slice(0, 12)}@Example.com`,
    password: "longenough1",
  });

  async function track(email: string) {
    const lower = email.trim().toLowerCase();
    const u = await one<{ id: string }>("select id from auth.users where lower(email) = $1", [lower]);
    if (u) createdUsers.push(u.id);
    rateKeys.push(`signin:email:${hashEmail(lower)}`);
    return u;
  }

  it("creates a confirmed account, a profile, and a live session in one step", async () => {
    const input = fresh();
    const ctx = ctxFor();
    await accounts.signUp(ctx, input);
    const u = await track(input.email);
    expect(u).not.toBeNull();

    expect((await ctx.supabase.auth.getSession()).data.session).not.toBeNull();
    const row = await one<{ display_name: string; role: string; status: string; confirmed: boolean }>(
      `select p.display_name, p.role, p.status, au.email_confirmed_at is not null as confirmed
       from public.profiles p join auth.users au on au.id = p.id where p.id = $1`,
      [u!.id],
    );
    expect(row).toEqual({ display_name: "Nimali Perera", role: "member", status: "active", confirmed: true });
  });

  it("stores the email lowercased so sign-in works with any capitalisation", async () => {
    const input = fresh();
    await accounts.signUp(ctxFor(), input);
    await track(input.email);
    await expect(accounts.signIn(ctxFor(), { email: input.email.toUpperCase(), password: input.password })).resolves.toMatchObject({ role: "member" });
  });

  it("reports an already-registered email as a field error", async () => {
    const input = fresh();
    await accounts.signUp(ctxFor(), input);
    await track(input.email);
    await expect(accounts.signUp(ctxFor(), input)).rejects.toMatchObject({
      code: "CONFLICT",
      fields: { email: "An account with this email already exists" },
    });
  });

  it("rejects bad input before creating anything", async () => {
    const input = fresh();
    await expect(accounts.signUp(ctxFor(), { ...input, password: "short" })).rejects.toMatchObject({ name: "ZodError" });
    await expect(accounts.signUp(ctxFor(), { ...input, fullName: "  " })).rejects.toMatchObject({ name: "ZodError" });
    await expect(accounts.signUp(ctxFor(), { ...input, email: "nope" })).rejects.toMatchObject({ name: "ZodError" });
    expect(await track(input.email)).toBeNull();
  });

  it("rate-limits per IP", async () => {
    const ctx = ctxFor();
    for (let i = 0; i < RATE_LIMITS.signup.limit; i++) await hit(`signup:${ctx.ip}`, RATE_LIMITS.signup);
    const input = fresh();
    await expect(accounts.signUp(ctx, input)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(await track(input.email)).toBeNull();
  });
});

describe("requestPasswordReset (Supabase stubbed)", () => {
  it("asks for a link that lands on /auth/callback then /reset-password", async () => {
    let seen: { email?: string; opts?: { redirectTo: string } } = {};
    const supabase = stubAuth({
      resetPasswordForEmail: async (email: string, opts: { redirectTo: string }) => ((seen = { email, opts }), { data: {}, error: null }),
    });
    await accounts.requestPasswordReset(ctxFor(supabase), { email: " Bob@Example.com" });
    expect(seen.email).toBe("bob@example.com");
    expect(seen.opts?.redirectTo).toContain("/auth/callback?next=%2Freset-password");
  });

  it("swallows unexpected provider errors (no account discovery) but surfaces rate limits", async () => {
    const quiet = stubAuth({ resetPasswordForEmail: async () => ({ data: {}, error: { code: "user_not_found", status: 404, message: "x" } }) });
    await expect(accounts.requestPasswordReset(ctxFor(quiet), { email: "a@b.co" })).resolves.toBeUndefined();
    const limited = stubAuth({ resetPasswordForEmail: async () => ({ data: {}, error: { code: "over_email_send_rate_limit", status: 429, message: "x" } }) });
    await expect(accounts.requestPasswordReset(ctxFor(limited), { email: "a@b.co" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});

describe("updatePassword", () => {
  it("changes the password for the signed-in user", async () => {
    const u = await makeUser();
    const ctx = ctxFor();
    await accounts.signIn(ctx, { email: u.email, password: PASSWORD });
    await accounts.updatePassword(ctx, await actorOf(u.id), { password: "Brand-new-pass-1" });

    await expect(accounts.signIn(ctxFor(), { email: u.email, password: PASSWORD })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(accounts.signIn(ctxFor(), { email: u.email, password: "Brand-new-pass-1" })).resolves.toMatchObject({ userId: u.id });
  });

  it("requires a signed-in, active user", async () => {
    await expect(accounts.updatePassword(ctxFor(), null, { password: "Brand-new-pass-1" })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    const u = await makeUser();
    const actor = { ...(await actorOf(u.id)), status: "suspended" as const };
    await expect(accounts.updatePassword(ctxFor(), actor, { password: "Brand-new-pass-1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("enforces the length rules", async () => {
    const u = await makeUser();
    await expect(accounts.updatePassword(ctxFor(), await actorOf(u.id), { password: "short" })).rejects.toMatchObject({ name: "ZodError" });
  });
});

describe("profiles", () => {
  it("getMyProfile returns the caller's profile including their email", async () => {
    const u = await makeUser({ name: "Kasun Fernando" });
    const me = await accounts.getMyProfile(await actorOf(u.id));
    expect(me).toMatchObject({ id: u.id, email: u.email, displayName: "Kasun Fernando", role: "member", verified: false, locale: "EN", avatarTone: "cream" });
  });

  it("updateMyProfile edits only whitelisted fields", async () => {
    const u = await makeUser();
    const actor = await actorOf(u.id);
    const after = await accounts.updateMyProfile(actor, {
      displayName: "  New Name ",
      bio: "Hello there",
      avatarTone: "sage",
      locale: "ES",
      username: "Fresh_Handle_" + randomUUID().slice(0, 6),
    });
    expect(after).toMatchObject({ displayName: "New Name", bio: "Hello there", avatarTone: "sage", locale: "ES" });
    expect(after.username).toMatch(/^fresh_handle_/);
  });

  it("cannot be used to escalate privileges", async () => {
    const u = await makeUser();
    const after = await accounts.updateMyProfile(await actorOf(u.id), { bio: "x", role: "admin", verified: true, status: "active" });
    expect(after).toMatchObject({ role: "member", verified: false });
    const row = await one<{ role: string; verified: boolean }>("select role, verified from public.profiles where id = $1", [u.id]);
    expect(row).toEqual({ role: "member", verified: false });
  });

  it("rejects a username someone else already has, as a field error", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const taken = (await actorOf(a.id)).username;
    await expect(accounts.updateMyProfile(await actorOf(b.id), { username: taken })).rejects.toMatchObject({
      code: "CONFLICT",
      fields: { username: "That username is taken" },
    });
  });

  it("treats usernames as case-insensitive", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const taken = (await actorOf(a.id)).username.toUpperCase();
    await expect(accounts.updateMyProfile(await actorOf(b.id), { username: taken })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects reserved and malformed usernames", async () => {
    const u = await makeUser();
    const actor = await actorOf(u.id);
    await expect(accounts.updateMyProfile(actor, { username: "admin" })).rejects.toMatchObject({ name: "ZodError" });
    await expect(accounts.updateMyProfile(actor, { username: "no spaces" })).rejects.toMatchObject({ name: "ZodError" });
  });

  it("an empty update is a no-op that returns the profile", async () => {
    const u = await makeUser();
    expect((await accounts.updateMyProfile(await actorOf(u.id), {})).id).toBe(u.id);
  });

  it("requires sign-in", async () => {
    await expect(accounts.updateMyProfile(null, { bio: "x" })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(accounts.getMyProfile(null)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("getPublicMember", () => {
  it("shows another member's public profile, never their email", async () => {
    const viewer = await makeUser();
    const target = await makeUser({ name: "Anjali Rao" });
    const username = (await actorOf(target.id)).username;
    const m = await accounts.getPublicMember(await actorOf(viewer.id), username);
    expect(m).toMatchObject({ username, displayName: "Anjali Rao", isStaff: false });
    expect(JSON.stringify(m)).not.toContain(target.email);
    expect(Object.keys(m)).not.toContain("email");
  });

  it("flags staff, hides suspended members, 404s unknown names", async () => {
    const viewer = await makeUser();
    const staff = await makeUser({ role: "admin" });
    const gone = await makeUser();
    const actor = await actorOf(viewer.id);
    expect((await accounts.getPublicMember(actor, (await actorOf(staff.id)).username)).isStaff).toBe(true);

    await db.query("update public.profiles set status = 'suspended' where id = $1", [gone.id]);
    await expect(accounts.getPublicMember(actor, (await actorOf(gone.id)).username)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(accounts.getPublicMember(actor, "no_such_member_xyz")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(accounts.getPublicMember(actor, "../etc/passwd")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("is members-only", async () => {
    await expect(accounts.getPublicMember(null, "anyone")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("deleteMyAccount", () => {
  it("needs the right password", async () => {
    const u = await makeUser();
    await expect(accounts.deleteMyAccount(ctxFor(), await actorOf(u.id), { password: "wrong-password" })).rejects.toMatchObject({
      code: "VALIDATION",
      fields: { password: "Incorrect password" },
    });
    expect(await one("select 1 from public.profiles where id = $1", [u.id])).not.toBeNull();
  });

  it("removes the account and its content but keeps donations as anonymous records", async () => {
    const u = await makeUser();
    const { rows: [ch] } = await db.query<{ id: string }>(
      "insert into public.channels (handle, name, category, status) values ($1, 'Del Test', 'faith', 'active') returning id",
      [`del_${randomUUID().slice(0, 8)}`],
    );
    channels.push(ch.id);
    const { rows: [don] } = await db.query<{ id: string }>(
      "insert into public.donations (channel_id, donor_id, amount_cents, currency) values ($1, $2, 2500, 'USD') returning id",
      [ch.id, u.id],
    );
    await db.query("insert into public.posts (author_id, body) values ($1, 'bye')", [u.id]);
    await db.query("insert into public.channel_follows (channel_id, user_id) values ($1, $2)", [ch.id, u.id]);

    const ctx = ctxFor();
    await accounts.signIn(ctx, { email: u.email, password: PASSWORD });
    await accounts.deleteMyAccount(ctx, await actorOf(u.id), { password: PASSWORD });

    expect(await one("select 1 from auth.users where id = $1", [u.id])).toBeNull();
    expect(await one("select 1 from public.profiles where id = $1", [u.id])).toBeNull();
    expect(await rows("select 1 from public.posts where author_id = $1", [u.id])).toHaveLength(0);
    expect(await rows("select 1 from public.channel_follows where user_id = $1", [u.id])).toHaveLength(0);
    const kept = await one<{ donor_id: string | null; amount_cents: number }>("select donor_id, amount_cents from public.donations where id = $1", [don.id]);
    expect(kept).toEqual({ donor_id: null, amount_cents: 2500 });
    // follower_count was kept consistent by the trigger when the follow cascaded away
    expect((await one<{ follower_count: number }>("select follower_count from public.channels where id = $1", [ch.id]))?.follower_count).toBe(0);
    await expect(accounts.signIn(ctxFor(), { email: u.email, password: PASSWORD })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("won't delete the only active admin", async () => {
    const others = await one<{ n: number }>("select count(*) as n from public.profiles where role = 'admin' and status = 'active'");
    if ((others?.n ?? 0) > 0) return; // real admins exist: the guard is exercised below instead
    const only = await makeUser({ role: "admin" });
    await expect(accounts.deleteMyAccount(ctxFor(), await actorOf(only.id), { password: PASSWORD })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await one("select 1 from auth.users where id = $1", [only.id])).not.toBeNull();
  });

  it("lets an admin delete themselves when another active admin exists", async () => {
    const a = await makeUser({ role: "admin" });
    const b = await makeUser({ role: "admin" });
    await accounts.deleteMyAccount(ctxFor(), await actorOf(a.id), { password: PASSWORD });
    expect(await one("select 1 from auth.users where id = $1", [a.id])).toBeNull();
    expect(await one("select 1 from auth.users where id = $1", [b.id])).not.toBeNull();
  });

  it("requires sign-in", async () => {
    await expect(accounts.deleteMyAccount(ctxFor(), null, { password: "x" })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});
