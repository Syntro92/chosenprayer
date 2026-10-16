import { headers } from "next/headers";
import { z } from "zod";
import { newPasswordSchema } from "@/lib/schemas/accounts";
import { adminRoute } from "@/server/admin-route";
import { createSupabaseServerClient } from "@/server/auth/supabase";
import { AppError } from "@/server/errors";
import { ipFromHeaders, json, parseJson } from "@/server/http";
import * as accounts from "@/server/services/accounts";

const body = newPasswordSchema.extend({ confirm: z.string() });

/** Sets the signed-in staff member's own password (also clears the "temporary password" flag). */
export const PUT = adminRoute(
  async (req, { actor }) => {
    const v = await parseJson(req, body);
    if (v.password !== v.confirm) throw new AppError("VALIDATION", "Passwords don't match.", { fields: { confirm: "Passwords don't match" } });
    const ctx = { supabase: await createSupabaseServerClient(), ip: ipFromHeaders(await headers()) };
    await accounts.updatePassword(ctx, actor, { password: v.password });
    return json({ ok: true });
  },
  "admin",
  { allowTempPassword: true },
);
