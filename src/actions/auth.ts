"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/safe-redirect";
import type { FormState } from "@/lib/forms";
import { action } from "@/server/action";
import { createSupabaseServerClient } from "@/server/auth/supabase";
import { getActor } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { ipFromHeaders } from "@/server/http";
import * as accounts from "@/server/services/accounts";

async function authContext(): Promise<accounts.AuthContext> {
  return { supabase: await createSupabaseServerClient(), ip: ipFromHeaders(await headers()) };
}

/** Plain string inputs from a form (File entries are ignored). */
function read(formData: FormData, keys: string[]): Record<string, string> {
  return Object.fromEntries(keys.map((k) => [k, typeof formData.get(k) === "string" ? (formData.get(k) as string) : ""]));
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const v = read(formData, ["email", "password", "next"]);
  const result = await action("signIn", async () => accounts.signIn(await authContext(), v));
  // Admin-issued temporary password: choose a new one before anything else.
  if (result.ok && result.data.mustChangePassword) redirect("/reset-password");
  if (result.ok) redirect(safeNext(v.next));
  return { ok: false, error: result.error, values: { email: v.email } };
}

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const v = read(formData, ["fullName", "email", "password", "next"]);
  // Honeypot filled in = a bot. Answer like an ordinary failure so it learns nothing.
  if (read(formData, ["company"]).company.trim()) {
    return { ok: false, error: { code: "UNAVAILABLE", message: "Something went wrong. Please try again in a moment." }, values: { fullName: v.fullName, email: v.email } };
  }
  const result = await action("signUp", async () => accounts.signUp(await authContext(), v));
  if (result.ok) redirect(safeNext(v.next));
  return { ok: false, error: result.error, values: { fullName: v.fullName, email: v.email } };
}

export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const v = read(formData, ["email"]);
  const result = await action("requestPasswordReset", async () => accounts.requestPasswordReset(await authContext(), v));
  if (!result.ok) return { ok: false, error: result.error, values: v };
  return { ok: true, message: "If an account exists for that email, a reset link is on its way.", values: v };
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const v = read(formData, ["password", "confirm"]);
  const result = await action("resetPassword", async () => {
    if (v.password !== v.confirm) {
      throw new AppError("VALIDATION", "Passwords don't match.", { fields: { confirm: "Passwords don't match" } });
    }
    await accounts.updatePassword(await authContext(), await getActor(), { password: v.password });
  });
  if (result.ok) redirect("/community");
  return { ok: false, error: result.error };
}

export async function signOutAction(): Promise<void> {
  await action("signOut", async () => accounts.signOut(await authContext()));
  redirect("/");
}
