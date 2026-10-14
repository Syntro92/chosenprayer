import { describe, expect, it } from "vitest";
import { getEnv } from "@/server/env";

describe("getEnv", () => {
  it("loads and validates the real environment", () => {
    const env = getEnv();
    expect(env.SUPABASE_URL).toMatch(/^https:\/\/.+\.supabase\.co$/);
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY.split(".")).toHaveLength(3);
    expect(env.PAYMENTS_PROVIDER).toBe("mock");
  });

  it("keeps the anon and service keys distinct (never swap them)", () => {
    const env = getEnv();
    const role = (jwt: string) => JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).role;
    expect(role(env.NEXT_PUBLIC_SUPABASE_ANON_KEY)).toBe("anon");
    expect(role(env.SUPABASE_SERVICE_ROLE_KEY)).toBe("service_role");
  });
});
