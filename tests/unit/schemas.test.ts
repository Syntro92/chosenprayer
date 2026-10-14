import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safe-redirect";
import {
  deleteAccountSchema,
  emailField,
  signInSchema,
  signUpSchema,
  updateProfileSchema,
  usernameField,
} from "@/lib/schemas/accounts";

describe("emailField", () => {
  it("trims and lowercases", () => {
    expect(emailField.parse("  Alice@Example.COM ")).toBe("alice@example.com");
  });
  it.each(["", "nope", "a@", "@b.com", "a b@c.com"])("rejects %j", (v) => {
    expect(emailField.safeParse(v).success).toBe(false);
  });
});

describe("signUpSchema", () => {
  const ok = { fullName: "Alice", email: "a@b.co", password: "longenough" };
  it("accepts a valid sign-up", () => {
    expect(signUpSchema.parse(ok)).toEqual(ok);
  });
  it("enforces password length 8..72", () => {
    expect(signUpSchema.safeParse({ ...ok, password: "short" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...ok, password: "x".repeat(73) }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...ok, password: "x".repeat(72) }).success).toBe(true);
  });
  it("requires a name and trims it", () => {
    expect(signUpSchema.safeParse({ ...ok, fullName: "   " }).success).toBe(false);
    expect(signUpSchema.parse({ ...ok, fullName: "  Bob  " }).fullName).toBe("Bob");
  });
  it("does not trim passwords (spaces are legal)", () => {
    expect(signUpSchema.parse({ ...ok, password: "  spaced out  " }).password).toBe("  spaced out  ");
  });
});

describe("signInSchema", () => {
  it("only requires a non-empty password (never reveal password rules at sign-in)", () => {
    expect(signInSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
    expect(signInSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
});

describe("usernameField", () => {
  it("normalises case", () => {
    expect(usernameField.parse("Nimali_P")).toBe("nimali_p");
  });
  it.each(["ab", "a".repeat(31), "has space", "dash-ed", "emoji😀", "admin", "Moderator"])("rejects %j", (v) => {
    expect(usernameField.safeParse(v).success).toBe(false);
  });
});

describe("updateProfileSchema", () => {
  it("is partial: only provided fields are validated", () => {
    expect(updateProfileSchema.parse({ bio: "hi" })).toEqual({ bio: "hi" });
    expect(updateProfileSchema.parse({})).toEqual({});
  });
  it("rejects bad tones, locales and long bios", () => {
    expect(updateProfileSchema.safeParse({ avatarTone: "neon" }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ locale: "XX" }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ bio: "x".repeat(301) }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ locale: "ES", avatarTone: "sage" }).success).toBe(true);
  });
  it("silently drops fields users must not set (role, status, verified)", () => {
    const parsed = updateProfileSchema.parse({ bio: "x", role: "admin", status: "active", verified: true });
    expect(parsed).toEqual({ bio: "x" });
  });
});

describe("deleteAccountSchema", () => {
  it("requires the password", () => {
    expect(deleteAccountSchema.safeParse({ password: "" }).success).toBe(false);
    expect(deleteAccountSchema.safeParse({ password: "pw" }).success).toBe(true);
  });
});

describe("safeNext (open-redirect guard)", () => {
  it("keeps normal in-site paths", () => {
    expect(safeNext("/community")).toBe("/community");
    expect(safeNext("/channels/noblesoul111?tab=blessings")).toBe("/channels/noblesoul111?tab=blessings");
    expect(safeNext("/account")).toBe("/account");
  });
  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "evil.example",
    "/ok\nSet-Cookie: x=1",
    "",
    null,
    undefined,
  ])("falls back for %j", (v) => {
    expect(safeNext(v as string | null | undefined)).toBe("/community");
  });
  it("never bounces back into auth pages", () => {
    for (const p of ["/signin", "/signup", "/forgot-password", "/reset-password", "/auth/callback?code=1"]) {
      expect(safeNext(p)).toBe("/community");
    }
    expect(safeNext("/signing-off-notes")).toBe("/signing-off-notes");
  });
  it("honours a custom fallback", () => {
    expect(safeNext("https://x.y", "/")).toBe("/");
  });
});
