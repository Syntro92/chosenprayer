import "server-only";
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  deleteAccountSchema,
  emailOnlySchema,
  newPasswordSchema,
  signInSchema,
  signUpSchema,
  updateProfileSchema,
  usernameField,
  type AvatarTone,
} from "@/lib/schemas/accounts";
import { createAdminClient } from "../auth/supabase";
import { requireMember, type Actor, type Role } from "../auth/policy";
import { db, one, rows, type Queryable } from "../db";
import { enqueueEmail, flushOutboxSoon } from "./email";
import { getEnv } from "../env";
import { AppError } from "../errors";
import { errorFields, log } from "../logger";
import { enforceRateLimit } from "../rate-limit";
import { ATTACHMENT_BUCKET, storage } from "../storage";

/** What a cookie-bound service call needs from its caller (built by the Server Action layer). */
export interface AuthContext {
  /** Supabase client acting as the visitor/user, with session cookies attached. */
  supabase: SupabaseClient;
  /** Caller IP, for rate limiting. */
  ip: string;
}

export interface MyProfile {
  id: string;
  email: string;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  avatarTone: AvatarTone;
  locale: string;
  role: Role;
  verified: boolean;
  createdAt: string;
}

export interface PublicMember {
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  avatarTone: AvatarTone;
  verified: boolean;
  isStaff: boolean;
  joinedAt: string;
}

const hashEmail = (email: string) => createHash("sha256").update(email).digest("hex").slice(0, 32);
const callbackUrl = (next: string) => `${getEnv().APP_URL}/auth/callback?next=${encodeURIComponent(next)}`;

/** Translate a Supabase Auth error into one of ours, with copy safe to show users. */
export function mapAuthError(error: { code?: string; status?: number; message: string }): AppError {
  switch (error.code) {
    case "invalid_credentials":
      return new AppError("UNAUTHENTICATED", "Incorrect email or password.");
    case "email_not_confirmed":
      // Sign-up marks accounts confirmed, so this only affects accounts created elsewhere.
      return new AppError("FORBIDDEN", "This account can't sign in yet. Please contact support.");
    case "user_banned":
      return new AppError("FORBIDDEN", "Your account is suspended.");
    case "weak_password":
      return new AppError("VALIDATION", "Please choose a stronger password.", { fields: { password: "Please choose a stronger password" } });
    case "same_password":
      return new AppError("VALIDATION", "Choose a password you haven't used before.", {
        fields: { password: "Choose a password you haven't used before" },
      });
    case "email_address_invalid":
      return new AppError("VALIDATION", "Enter a valid email address.", { fields: { email: "Enter a valid email address" } });
    case "signup_disabled":
      return new AppError("FORBIDDEN", "New sign-ups are closed right now.");
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return new AppError("RATE_LIMITED", "Too many requests. Please try again in a little while.", { retryAfter: 60 });
    case "email_address_not_authorized":
      return new AppError("UNAVAILABLE", "We can't send email to that address right now. Please try again later.");
    default:
      if (error.status === 429) return new AppError("RATE_LIMITED", "Too many requests. Please try again in a little while.", { retryAfter: 60 });
      return new AppError("INTERNAL", "Something went wrong.", { cause: error });
  }
}

/* ------------------------------------------------------------------------ */
/* Sign up / in / out                                                        */
/* ------------------------------------------------------------------------ */

/**
 * Creates the account and signs the new user in. There is no email confirmation:
 * the account is created already-confirmed through the admin API (so Supabase never
 * sends a confirmation mail, whatever the dashboard's "Confirm email" switch says),
 * then a normal password sign-in sets the session cookies.
 *
 * Trade-off: an email address is not proven to belong to the person signing up.
 * Registering an address that already has an account is reported plainly.
 */
export async function signUp(ctx: AuthContext, raw: unknown): Promise<void> {
  const input = signUpSchema.parse(raw);
  await enforceRateLimit("signup", ctx.ip);

  const { error } = await createAdminClient().auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });
  if (error) {
    if (error.code === "email_exists" || error.code === "user_already_exists") {
      throw new AppError("CONFLICT", "An account with this email already exists.", {
        fields: { email: "An account with this email already exists" },
      });
    }
    throw mapAuthError(error);
  }

  const { error: signInError } = await ctx.supabase.auth.signInWithPassword({ email: input.email, password: input.password });
  if (signInError) throw mapAuthError(signInError);
}

export async function signIn(ctx: AuthContext, raw: unknown): Promise<{ userId: string; role: Role; mustChangePassword: boolean }> {
  const input = signInSchema.parse(raw);
  // Two buckets: per IP (spraying many accounts) and per email (hammering one account).
  await enforceRateLimit("signin", ctx.ip);
  await enforceRateLimit("signin", `email:${hashEmail(input.email)}`);

  const { data, error } = await ctx.supabase.auth.signInWithPassword({ email: input.email, password: input.password });
  if (error || !data.user) throw mapAuthError(error ?? { message: "no user returned" });

  const profile = await one<{ status: string; role: Role; must_change_password: boolean }>(
    "select status, role, must_change_password from public.profiles where id = $1",
    [data.user.id],
  );
  if (!profile || profile.status !== "active") {
    await ctx.supabase.auth.signOut();
    throw new AppError("FORBIDDEN", "Your account is suspended.");
  }
  return { userId: data.user.id, role: profile.role, mustChangePassword: profile.must_change_password };
}

export async function signOut(ctx: AuthContext): Promise<void> {
  await ctx.supabase.auth.signOut();
}

/* ------------------------------------------------------------------------ */
/* Passwords                                                                 */
/* ------------------------------------------------------------------------ */

/**
 * Sends the reset link. Unknown addresses look identical to known ones.
 * The link lands on /auth/callback, which signs the user into a recovery session
 * and forwards to /reset-password.
 */
export async function requestPasswordReset(ctx: AuthContext, raw: unknown): Promise<void> {
  const { email } = emailOnlySchema.parse(raw);
  await enforceRateLimit("passwordReset", ctx.ip);
  await enforceRateLimit("passwordReset", `email:${hashEmail(email)}`);

  const { error } = await ctx.supabase.auth.resetPasswordForEmail(email, { redirectTo: callbackUrl("/reset-password") });
  if (error && (error.status === 429 || error.code === "email_address_not_authorized")) throw mapAuthError(error);
  if (error) log.warn("password reset request failed", { code: error.code });
}

/** Sets a new password for the signed-in user (also used right after a recovery link). */
export async function updatePassword(ctx: AuthContext, actor: Actor | null, raw: unknown, conn: Queryable = db): Promise<void> {
  const a = requireMember(actor);
  const { password } = newPasswordSchema.parse(raw);
  const { error } = await ctx.supabase.auth.updateUser({ password });
  if (error) throw mapAuthError(error);
  // A temporary password has now been replaced by one only the user knows.
  await conn.query("update public.profiles set must_change_password = false where id = $1 and must_change_password", [a.userId]);
  const me = await one<{ email: string }>("select email::text as email from auth.users where id = $1", [a.userId], conn);
  if (me) await enqueueEmail(conn, { to: me.email, template: "password_changed", payload: {} });
  await flushOutboxSoon(conn);
}

/* ------------------------------------------------------------------------ */
/* Profiles                                                                  */
/* ------------------------------------------------------------------------ */

interface ProfileRow {
  id: string;
  email: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string | null;
  avatar_tone: AvatarTone;
  locale: string;
  role: Role;
  verified: boolean;
  created_at: Date;
}

const MY_PROFILE_SQL = `
  select p.id, u.email, p.username, p.display_name, p.bio, p.avatar_url, p.avatar_tone,
         p.locale, p.role, p.verified, p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = $1`;

const toMyProfile = (r: ProfileRow): MyProfile => ({
  id: r.id,
  email: r.email,
  username: r.username,
  displayName: r.display_name,
  bio: r.bio,
  avatarUrl: r.avatar_url,
  avatarTone: r.avatar_tone,
  locale: r.locale,
  role: r.role,
  verified: r.verified,
  createdAt: r.created_at.toISOString(),
});

export async function getMyProfile(actor: Actor | null): Promise<MyProfile> {
  const a = requireMember(actor);
  const row = await one<ProfileRow>(MY_PROFILE_SQL, [a.userId]);
  if (!row) throw new AppError("NOT_FOUND", "Profile not found.");
  return toMyProfile(row);
}

// Input key -> column. A whitelist, so a request can never touch role/status/verified.
const EDITABLE: Record<string, string> = {
  displayName: "display_name",
  username: "username",
  bio: "bio",
  avatarTone: "avatar_tone",
  locale: "locale",
};

export async function updateMyProfile(actor: Actor | null, raw: unknown): Promise<MyProfile> {
  const a = requireMember(actor);
  const input = updateProfileSchema.parse(raw) as Record<string, unknown>;

  const sets: string[] = [];
  const params: unknown[] = [a.userId];
  for (const [key, column] of Object.entries(EDITABLE)) {
    if (input[key] === undefined) continue;
    params.push(input[key]);
    sets.push(`${column} = $${params.length}`);
  }
  if (sets.length > 0) {
    try {
      await db.query(`update public.profiles set ${sets.join(", ")} where id = $1`, params);
    } catch (e) {
      if ((e as { code?: string }).code === "23505") {
        throw new AppError("CONFLICT", "That username is taken.", { fields: { username: "That username is taken" } });
      }
      throw e;
    }
  }
  return getMyProfile(a);
}

/** Another member's public profile. Members-only; never includes email. */
export async function getPublicMember(actor: Actor | null, rawUsername: string): Promise<PublicMember> {
  requireMember(actor);
  const parsed = usernameField.safeParse(rawUsername);
  if (!parsed.success) throw new AppError("NOT_FOUND", "Member not found.");

  const row = await one<ProfileRow>(
    `select p.id, ''::text as email, p.username, p.display_name, p.bio, p.avatar_url, p.avatar_tone,
            p.locale, p.role, p.verified, p.created_at
     from public.profiles p where p.username = $1 and p.status = 'active'`,
    [parsed.data],
  );
  if (!row) throw new AppError("NOT_FOUND", "Member not found.");
  return {
    username: row.username,
    displayName: row.display_name,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    avatarTone: row.avatar_tone,
    verified: row.verified,
    isStaff: row.role !== "member",
    joinedAt: row.created_at.toISOString(),
  };
}

/* ------------------------------------------------------------------------ */
/* Account deletion                                                          */
/* ------------------------------------------------------------------------ */

/**
 * Permanently deletes the signed-in user's account after re-checking their password.
 * Cascades remove their profile, posts, comments, likes, follows and notifications.
 * Donations are kept (donor_id becomes null): they are financial records.
 */
export async function deleteMyAccount(ctx: AuthContext, actor: Actor | null, raw: unknown): Promise<void> {
  const a = requireMember(actor);
  const { password } = deleteAccountSchema.parse(raw);
  await enforceRateLimit("signin", `delete:${a.userId}`);

  const user = await one<{ email: string }>("select email from auth.users where id = $1", [a.userId]);
  if (!user) throw new AppError("NOT_FOUND", "Account not found.");

  // Prove it's really them, on a throwaway client so the caller's session is untouched.
  const env = getEnv();
  const verifier = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error: pwError } = await verifier.auth.signInWithPassword({ email: user.email, password });
  if (pwError) {
    if (pwError.status === 429) throw mapAuthError(pwError);
    throw new AppError("VALIDATION", "Incorrect password.", { fields: { password: "Incorrect password" } });
  }

  if (a.role === "owner") throw new AppError("FORBIDDEN", "An owner account can't be deleted.");
  if (a.role === "admin") {
    const admins = await one<{ n: number }>("select count(*) as n from public.profiles where role in ('admin', 'owner') and status = 'active'");
    if ((admins?.n ?? 0) <= 1) {
      throw new AppError("CONFLICT", "You're the only admin. Make someone else an admin before deleting your account.");
    }
  }

  // Collect the user's uploaded files first: once the account is gone nothing links to them.
  const files = await rows<{ name: string }>(
    "select name from storage.objects where bucket_id = $1 and name like $2",
    [ATTACHMENT_BUCKET, `posts/${a.userId}/%`],
  );

  const { error } = await createAdminClient().auth.admin.deleteUser(a.userId);
  if (error) {
    log.error("account deletion failed", { userId: a.userId, ...errorFields(error) });
    throw new AppError("INTERNAL", "Something went wrong.", { cause: error });
  }
  await storage.remove(files.map((f) => f.name));
  await enqueueEmail(db, { to: user.email, template: "account_deleted", payload: {} }).catch((e) => log.warn("deletion email not queued", errorFields(e)));
  await flushOutboxSoon();
  await ctx.supabase.auth.signOut().catch(() => {});
}
