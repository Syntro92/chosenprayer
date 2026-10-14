"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/forms";
import { action } from "@/server/action";
import { createSupabaseServerClient } from "@/server/auth/supabase";
import { getActor } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { ipFromHeaders } from "@/server/http";
import * as accounts from "@/server/services/accounts";

function read(formData: FormData, keys: string[]): Record<string, string> {
  return Object.fromEntries(keys.map((k) => [k, typeof formData.get(k) === "string" ? (formData.get(k) as string) : ""]));
}

async function authContext(): Promise<accounts.AuthContext> {
  return { supabase: await createSupabaseServerClient(), ip: ipFromHeaders(await headers()) };
}

export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const v = read(formData, ["displayName", "username", "bio", "avatarTone", "locale"]);
  const result = await action("updateProfile", async () => accounts.updateMyProfile(await getActor(), v));
  if (!result.ok) return { ok: false, error: result.error, values: v };
  return { ok: true, message: "Profile saved.", values: v };
}

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const v = read(formData, ["password", "confirm"]);
  const result = await action("changePassword", async () => {
    if (v.password !== v.confirm) {
      throw new AppError("VALIDATION", "Passwords don't match.", { fields: { confirm: "Passwords don't match" } });
    }
    await accounts.updatePassword(await authContext(), await getActor(), { password: v.password });
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, message: "Password updated." };
}

export async function deleteAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const v = read(formData, ["password"]);
  const result = await action("deleteAccount", async () => accounts.deleteMyAccount(await authContext(), await getActor(), v));
  if (result.ok) redirect("/");
  return { ok: false, error: result.error };
}
