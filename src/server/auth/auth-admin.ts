import "server-only";
import { AppError } from "../errors";
import { createAdminClient } from "./supabase";

/**
 * The one Supabase Auth admin capability moderation needs, behind an interface so the
 * services can be tested without banning real accounts.
 */
export interface AuthAdmin {
  /** Block (or allow again) a user from signing in / refreshing their session. */
  setBanned(userId: string, banned: boolean): Promise<void>;
}

/** Creates an already-confirmed account (no confirmation email). Separate so moderation fakes stay small. */
export interface AuthProvisioner {
  createUser(input: { email: string; password: string; fullName: string }): Promise<{ id: string }>;
}

export const authProvisioner: AuthProvisioner = {
  async createUser({ email, password, fullName }) {
    const { data, error } = await createAdminClient().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error || !data.user) {
      if (error?.code === "email_exists" || error?.code === "user_already_exists") {
        throw new AppError("CONFLICT", "An account with this email already exists.", {
          fields: { email: "An account with this email already exists" },
        });
      }
      if (error?.code === "weak_password") {
        throw new AppError("VALIDATION", "Please choose a stronger password.", { fields: { password: "Please choose a stronger password" } });
      }
      throw new AppError("INTERNAL", "Something went wrong.", { cause: error });
    }
    return { id: data.user.id };
  },
};

export const authAdmin: AuthAdmin = {
  async setBanned(userId, banned) {
    // ~100 years: effectively "until unsuspended". "none" lifts the ban.
    const { error } = await createAdminClient().auth.admin.updateUserById(userId, {
      ban_duration: banned ? "876000h" : "none",
    });
    if (error) throw new AppError("INTERNAL", "Something went wrong.", { cause: error });
  },
};
