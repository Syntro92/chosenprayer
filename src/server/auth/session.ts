import "server-only";
import { connection } from "next/server";
import { cache } from "react";
import { one } from "../db";
import { errorFields, log } from "../logger";
import type { Actor, AccountStatus, Role } from "./policy";
import { createSupabaseServerClient } from "./supabase";

interface ProfileRow {
  username: string;
  display_name: string;
  role: Role;
  status: AccountStatus;
  must_change_password: boolean;
}

/**
 * The signed-in user for this request, or null for a visitor.
 *
 * Identity comes from `supabase.auth.getUser()`, which validates the session with
 * Supabase (an unverified cookie is never trusted). Role and status are then read
 * fresh from `profiles`, so a demotion or suspension takes effect immediately.
 * Memoised per request via React `cache`.
 */
export const getActor = cache(async (): Promise<Actor | null> => {
  // Everything below needs the real request (cookies, the clock for token expiry, network
  // I/O), so opt out of prerendering FIRST. Even constructing the Supabase client reads the
  // clock. These two awaits are deliberately outside the try/catch: Next signals "this render
  // needs request-time data" by throwing from them during prerender, and swallowing that would
  // break Cache Components and silently render every visitor as signed out.
  await connection();
  const supabase = await createSupabaseServerClient();
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;

    const profile = await one<ProfileRow>(
      "select username, display_name, role, status, must_change_password from public.profiles where id = $1",
      [data.user.id],
    );
    if (!profile) return null;

    return {
      userId: data.user.id,
      username: profile.username,
      displayName: profile.display_name,
      role: profile.role,
      status: profile.status,
      mustChangePassword: profile.must_change_password,
    };
  } catch (e) {
    log.error("getActor failed; treating request as anonymous", errorFields(e));
    return null;
  }
});
