import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getEnv } from "../env";

let admin: SupabaseClient | undefined;

/**
 * Service-role client: bypasses RLS and can manage auth users (ban, delete, ...).
 * Server-only and for trusted code paths. Never hand its results to a user
 * without checking that user's permissions first.
 */
export function createAdminClient(): SupabaseClient {
  if (!admin) {
    const env = getEnv();
    admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return admin;
}

/**
 * Per-request client that acts as the signed-in user, with the session stored in
 * httpOnly cookies. Used for sign-in/sign-up/sign-out and for identifying the caller.
 */
export async function createSupabaseServerClient() {
  const env = getEnv();
  const store = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Safe to ignore: proxy.ts refreshes the session on the next request.
        }
      },
    },
  });
}
