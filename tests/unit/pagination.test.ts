import { describe, expect, it } from "vitest";
import { clampLimit, decodeCursor, encodeCursor, toPage } from "@/server/pagination";

describe("cursors", () => {
  it("round-trips", () => {
    const c = { k: "2026-10-12T00:00:00.000Z", id: "abc" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
    expect(decodeCursor(encodeCursor({ k: 42, id: "x" }))).toEqual({ k: 42, id: "x" });
  });

  it("treats empty as the first page", () => {
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor("")).toBeNull();
  });

  it("rejects garbage and wrongly-shaped cursors", () => {
    expect(() => decodeCursor("not-base64-json!!")).toThrow(/Invalid cursor/);
    expect(() => decodeCursor(Buffer.from(JSON.stringify({ nope: 1 })).toString("base64url"))).toThrow(/Invalid cursor/);
  });
});

describe("clampLimit", () => {
  it("defaults, floors and caps", () => {
    expect(clampLimit(undefined)).toBe(20);
    expect(clampLimit("abc")).toBe(20);
    expect(clampLimit(0)).toBe(20);
    expect(clampLimit("7")).toBe(7);
    expect(clampLimit(7.9)).toBe(7);
    expect(clampLimit(10_000)).toBe(50);
  });
});

describe("toPage", () => {
  const rows = [1, 2, 3, 4].map((n) => ({ id: `id${n}`, n }));
  const cursorOf = (r: { id: string; n: number }) => ({ k: r.n, id: r.id });

  it("trims the look-ahead row and links to the next page", () => {
    const page = toPage(rows, 3, cursorOf);
    expect(page.items).toHaveLength(3);
    expect(decodeCursor(page.nextCursor)).toEqual({ k: 3, id: "id3" });
  });

  it("has no next cursor on the last page", () => {
    expect(toPage(rows.slice(0, 3), 3, cursorOf).nextCursor).toBeNull();
    expect(toPage([], 3, cursorOf)).toEqual({ items: [], nextCursor: null });
  });
});
