import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError, fail, ok, toAppError } from "@/server/errors";

describe("toAppError", () => {
  it("passes AppError through unchanged", () => {
    const e = new AppError("NOT_FOUND", "nope");
    expect(toAppError(e)).toBe(e);
    expect(e.status).toBe(404);
  });

  it("turns zod errors into VALIDATION with per-field messages", () => {
    const r = z.object({ email: z.string().email("Enter a valid email"), age: z.number() }).safeParse({ email: "x", age: "y" });
    const e = toAppError(r.error);
    expect(e.code).toBe("VALIDATION");
    expect(e.status).toBe(400);
    expect(e.fields?.email).toBe("Enter a valid email");
    expect(e.fields?.age).toBeDefined();
  });

  it.each([
    ["23505", "CONFLICT"],
    ["23503", "VALIDATION"],
    ["23502", "VALIDATION"],
    ["22P02", "VALIDATION"],
    ["42501", "FORBIDDEN"],
    ["40001", "CONFLICT"],
    ["57014", "UNAVAILABLE"],
    ["XX000", "INTERNAL"],
  ])("maps postgres %s to %s", (code, expected) => {
    expect(toAppError({ code, message: "raw" }).code).toBe(expected);
  });

  it("shows trigger-raised check_violation messages but hides constraint internals", () => {
    const fromTrigger = toAppError({ code: "23514", message: "a post can have at most 6 attachments" });
    expect(fromTrigger.message).toBe("a post can have at most 6 attachments");
    const fromConstraint = toAppError({
      code: "23514",
      constraint: "posts_body_check",
      message: 'violates check constraint "posts_body_check"',
    });
    expect(fromConstraint.message).not.toContain("posts_body_check");
  });

  it("never leaks the message of unknown errors", () => {
    const e = toAppError(new Error("password=hunter2 in connection string"));
    expect(e.code).toBe("INTERNAL");
    expect(e.message).toBe("Something went wrong.");
  });
});

describe("Result helpers", () => {
  it("ok / fail", () => {
    expect(ok(5)).toEqual({ ok: true, data: 5 });
    const f = fail(new AppError("RATE_LIMITED", "slow down", { retryAfter: 30 }));
    expect(f).toMatchObject({ ok: false, error: { code: "RATE_LIMITED", retryAfter: 30 } });
  });
});
