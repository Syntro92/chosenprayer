import { z } from "zod";
import { LANGUAGES } from "@/lib/languages";

// Client-safe: shared by the forms (instant hints) and the server (the real check).

export const AVATAR_TONES = ["cream", "bless", "mist", "sage", "line"] as const;
export type AvatarTone = (typeof AVATAR_TONES)[number];

const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "moderator", "mod", "support", "help", "staff", "system", "root", "null",
  "chosenprayer", "official", "api", "www", "me", "you", "anonymous",
]);

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter your email")
  .max(254, "That email is too long")
  .pipe(z.email("Enter a valid email address"));

export const passwordField = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(72, "Use 72 characters or fewer");

export const displayNameField = z
  .string()
  .trim()
  .min(1, "Enter your name")
  .max(80, "Use 80 characters or fewer");

export const usernameField = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,30}$/, "3–30 characters: letters, numbers or underscores")
  .refine((u) => !RESERVED_USERNAMES.has(u), "That username is reserved");

export const signUpSchema = z.object({
  fullName: displayNameField,
  email: emailField,
  password: passwordField,
});

export const signInSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Enter your password").max(200),
});

export const emailOnlySchema = z.object({ email: emailField });

export const newPasswordSchema = z.object({ password: passwordField });

export const updateProfileSchema = z
  .object({
    displayName: displayNameField,
    username: usernameField,
    bio: z.string().trim().max(300, "Use 300 characters or fewer"),
    avatarTone: z.enum(AVATAR_TONES),
    locale: z.enum(LANGUAGES.map((l) => l.code) as [string, ...string[]]),
  })
  .partial();

export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Enter your password to confirm").max(200),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
