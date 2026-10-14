import { describe, expect, it } from "vitest";
import { hasRole, requireMember, requireOwnerOrRole, requireRole, type Actor } from "@/server/auth/policy";

const actor = (over: Partial<Actor> = {}): Actor => ({
  userId: "u1",
  username: "u1",
  displayName: "U1",
  role: "member",
  status: "active",
  ...over,
});

describe("requireMember", () => {
  it("rejects anonymous with UNAUTHENTICATED", () => {
    expect(() => requireMember(null)).toThrowError(expect.objectContaining({ code: "UNAUTHENTICATED" }));
  });
  it("rejects suspended with FORBIDDEN", () => {
    expect(() => requireMember(actor({ status: "suspended" }))).toThrowError(expect.objectContaining({ code: "FORBIDDEN" }));
  });
  it("accepts an active member", () => {
    expect(requireMember(actor()).userId).toBe("u1");
  });
});

describe("role hierarchy", () => {
  it("admin >= moderator >= member", () => {
    expect(hasRole(actor({ role: "admin" }), "moderator")).toBe(true);
    expect(hasRole(actor({ role: "moderator" }), "admin")).toBe(false);
    expect(hasRole(actor({ role: "member" }), "moderator")).toBe(false);
    expect(hasRole(null, "member")).toBe(false);
  });
  it("a suspended admin has no powers", () => {
    expect(hasRole(actor({ role: "admin", status: "suspended" }), "member")).toBe(false);
    expect(() => requireRole(actor({ role: "admin", status: "suspended" }), "admin")).toThrow();
  });
  it("requireRole blocks lower roles", () => {
    expect(() => requireRole(actor(), "moderator")).toThrowError(expect.objectContaining({ code: "FORBIDDEN" }));
    expect(requireRole(actor({ role: "admin" }), "moderator").role).toBe("admin");
  });
});

describe("requireOwnerOrRole", () => {
  it("allows the owner", () => {
    expect(requireOwnerOrRole(actor(), "u1", "moderator").userId).toBe("u1");
  });
  it("allows a moderator on someone else's content", () => {
    expect(requireOwnerOrRole(actor({ userId: "m", role: "moderator" }), "u1", "moderator").userId).toBe("m");
  });
  it("blocks a different plain member", () => {
    expect(() => requireOwnerOrRole(actor({ userId: "other" }), "u1", "moderator")).toThrowError(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
  });
  it("does not treat a missing owner as a match", () => {
    expect(() => requireOwnerOrRole(actor(), null, "moderator")).toThrow();
  });
});
