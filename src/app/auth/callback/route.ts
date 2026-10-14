import { NextResponse } from "next/server";
import { safeNext } from "@/lib/safe-redirect";
import { createSupabaseServerClient } from "@/server/auth/supabase";
import { errorFields, log } from "@/server/logger";

/**
 * Landing point for the links Supabase emails out (confirm sign-up, reset password).
 * They arrive with a one-time `?code=`; we swap it for a session cookie and send the
 * user on to `next`. A bad or expired link goes back to sign-in with a message.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"), "/community");

  // Allow the reset page through safeNext's auth-page guard, but only that one.
  const destination = url.searchParams.get("next") === "/reset-password" ? "/reset-password" : next;

  if (code) {
    try {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(destination, url.origin));
      log.info("auth callback: code exchange rejected", { code: error.code });
    } catch (e) {
      log.error("auth callback failed", errorFields(e));
    }
  }
  return NextResponse.redirect(new URL("/signin?error=link", url.origin));
}
