import { headers } from "next/headers";
import { adminSignInSchema } from "@/lib/schemas/admin";
import { createSupabaseServerClient } from "@/server/auth/supabase";
import { AppError } from "@/server/errors";
import { handler, ipFromHeaders, json, parseJson } from "@/server/http";
import * as accounts from "@/server/services/accounts";

/**
 * Admin panel sign-in: the same Supabase session as the website, but only staff get through.
 * A regular member who types a correct password is signed straight back out.
 */
export const POST = handler(async (req) => {
  const body = await parseJson(req, adminSignInSchema);
  const ctx = { supabase: await createSupabaseServerClient(), ip: ipFromHeaders(await headers()) };
  const { role, mustChangePassword } = await accounts.signIn(ctx, body);
  if (role === "member") {
    await accounts.signOut(ctx);
    throw new AppError("FORBIDDEN", "This account does not have admin access.");
  }
  return json({ ok: true, role, mustChangePassword });
});

export const DELETE = handler(async () => {
  await accounts.signOut({ supabase: await createSupabaseServerClient(), ip: ipFromHeaders(await headers()) });
  return json({ ok: true });
});
