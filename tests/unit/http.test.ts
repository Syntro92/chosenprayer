import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError } from "@/server/errors";
import { clientIp, handler, isSameOrigin, parseJson } from "@/server/http";

const APP = "http://localhost:3000";

describe("isSameOrigin", () => {
  const base = { host: "localhost:3000", secFetchSite: null, appUrl: APP };
  it("accepts a matching Origin", () => {
    expect(isSameOrigin({ ...base, origin: "http://localhost:3000" })).toBe(true);
  });
  it("rejects a foreign Origin", () => {
    expect(isSameOrigin({ ...base, origin: "https://evil.example" })).toBe(false);
  });
  it("rejects a malformed Origin", () => {
    expect(isSameOrigin({ ...base, origin: "not a url" })).toBe(false);
  });
  it("allows no Origin (curl/server-to-server) but refuses browser cross-site", () => {
    expect(isSameOrigin({ ...base, origin: null })).toBe(true);
    expect(isSameOrigin({ ...base, origin: null, secFetchSite: "cross-site" })).toBe(false);
    expect(isSameOrigin({ ...base, origin: null, secFetchSite: "same-origin" })).toBe(true);
  });
});

describe("clientIp", () => {
  it("prefers the first x-forwarded-for hop", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1", "x-real-ip": "9.9.9.9" } });
    expect(clientIp(req)).toBe("1.2.3.4");
  });
  it("falls back to x-real-ip then 'unknown'", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-real-ip": "9.9.9.9" } }))).toBe("9.9.9.9");
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });
});

describe("parseJson", () => {
  const schema = z.object({ n: z.number() });
  const post = (body: string) => new Request("http://x", { method: "POST", body });
  it("parses valid JSON", async () => {
    expect(await parseJson(post('{"n":1}'), schema)).toEqual({ n: 1 });
  });
  it("rejects invalid JSON and wrong shapes", async () => {
    await expect(parseJson(post("{oops"), schema)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(parseJson(post('{"n":"x"}'), schema)).rejects.toMatchObject({ name: "ZodError" });
  });
  it("rejects oversized bodies", async () => {
    await expect(parseJson(post("x".repeat(1_000_001)), schema)).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("handler", () => {
  it("passes successful responses through with a request id", async () => {
    const res = await handler(async () => Response.json({ hi: 1 }))(new Request("http://localhost:3000/api/t"), undefined);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  it("renders AppError as the standard JSON error with Retry-After", async () => {
    const h = handler(async () => {
      throw new AppError("RATE_LIMITED", "slow down", { retryAfter: 12 });
    });
    const res = await h(new Request("http://localhost:3000/api/t"), undefined);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("12");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: { code: "RATE_LIMITED", message: "slow down", retryAfter: 12 } });
  });

  it("hides internals of unexpected errors", async () => {
    const h = handler(async () => {
      throw new Error("db password is hunter2");
    });
    const res = await h(new Request("http://localhost:3000/api/t"), undefined);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("hunter2");
  });

  it("blocks cross-site POSTs before running the handler", async () => {
    let ran = false;
    const h = handler(async () => {
      ran = true;
      return Response.json({});
    });
    const req = new Request("http://localhost:3000/api/t", {
      method: "POST",
      headers: { origin: "https://evil.example", host: "localhost:3000" },
    });
    const res = await h(req, undefined);
    expect(res.status).toBe(403);
    expect(ran).toBe(false);
  });

  it("skips the origin check when csrf is disabled (webhooks)", async () => {
    const h = handler(async () => Response.json({ ok: true }), { csrf: false });
    const res = await h(new Request("http://localhost:3000/api/t", { method: "POST", headers: { origin: "https://stripe.example" } }), undefined);
    expect(res.status).toBe(200);
  });
});
