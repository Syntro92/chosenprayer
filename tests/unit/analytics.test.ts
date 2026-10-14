import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "@/lib/security-headers";
import { channelHandle, classifyDevice, cleanCountry, cleanPath, cleanReferrer, readVisitorId, trackSchema } from "@/server/services/analytics";

describe("classifyDevice", () => {
  it.each([
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36", "desktop"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17 Safari/605.1.15", "desktop"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148", "mobile"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36", "mobile"],
    ["Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148", "tablet"],
    ["Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 Chrome/126 Safari/537.36", "tablet"],
    ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "bot"],
    ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0)", "bot"],
    ["HeadlessChrome/126.0", "bot"],
    ["curl/8.5.0", "bot"],
    ["", "bot"],
    [null, "bot"],
  ])("%s -> %s", (ua, expected) => {
    expect(classifyDevice(ua as string | null)).toBe(expected);
  });
});

describe("cleanPath", () => {
  it("keeps normal pages and strips query, hash and trailing slash", () => {
    expect(cleanPath("/")).toBe("/");
    expect(cleanPath("/channels")).toBe("/channels");
    expect(cleanPath("/channels/")).toBe("/channels");
    expect(cleanPath("/channels?q=faith&token=secret#top")).toBe("/channels");
    expect(cleanPath("/community//posts///abc")).toBe("/community/posts/abc");
  });
  it("ignores the admin panel, APIs, internals, auth callbacks and non-paths", () => {
    for (const p of ["/admin", "/admin/users", "/api/track", "/_next/static/x.js", "/auth/callback", "https://evil.example/", "//evil.example", "channels", "", "/a\u0000b", "/" + "x".repeat(600)]) {
      expect(cleanPath(p)).toBeNull();
    }
    expect(cleanPath("/administrators")).toBe("/administrators"); // prefix match is on whole segments
  });
});

describe("cleanReferrer", () => {
  it("keeps external origins and paths but drops query strings", () => {
    expect(cleanReferrer("https://www.google.com/search?q=secret", "localhost:3000")).toBe("https://www.google.com/search");
    expect(cleanReferrer("https://t.co/", "localhost:3000")).toBe("https://t.co");
  });
  it("drops our own site, junk and non-http schemes", () => {
    expect(cleanReferrer("http://localhost:3000/channels", "localhost:3000")).toBeNull();
    expect(cleanReferrer("javascript:alert(1)", "localhost:3000")).toBeNull();
    expect(cleanReferrer("android-app://com.google.android.gm", "localhost:3000")).toBeNull();
    expect(cleanReferrer("not a url", "localhost:3000")).toBeNull();
    expect(cleanReferrer(undefined, "localhost:3000")).toBeNull();
    expect(cleanReferrer("", "localhost:3000")).toBeNull();
  });
});

describe("visitor cookie, country, channel handle", () => {
  const id = "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b";
  it("reads only a well-formed uuid", () => {
    expect(readVisitorId(`a=1; cp_vid=${id}; b=2`)).toBe(id);
    expect(readVisitorId(`cp_vid=${id.toUpperCase()}`)).toBe(id);
    expect(readVisitorId("cp_vid=not-a-uuid")).toBeNull();
    expect(readVisitorId("other=1")).toBeNull();
    expect(readVisitorId(null)).toBeNull();
  });
  it("accepts two-letter countries (not the XX placeholder)", () => {
    expect(cleanCountry("au")).toBe("AU");
    expect(cleanCountry("XX")).toBeNull();
    expect(cleanCountry("AUS")).toBeNull();
    expect(cleanCountry(null)).toBeNull();
  });
  it("finds the channel handle only on channel pages", () => {
    expect(channelHandle("/channels/QuietMornings")).toBe("quietmornings");
    expect(channelHandle("/channels")).toBeNull();
    expect(channelHandle("/channels/a/b")).toBeNull();
    expect(channelHandle("/community")).toBeNull();
  });
  it("validates the beacon body", () => {
    expect(trackSchema.safeParse({ path: "/x" }).success).toBe(true);
    expect(trackSchema.safeParse({ path: "" }).success).toBe(false);
    expect(trackSchema.safeParse({ path: "/x".repeat(300) }).success).toBe(false);
    expect(trackSchema.safeParse({}).success).toBe(false);
  });
});

describe("security headers", () => {
  const prod = Object.fromEntries(securityHeaders().map((h) => [h.key, h.value]));
  it("sets the standard protections", () => {
    expect(prod["X-Content-Type-Options"]).toBe("nosniff");
    expect(prod["X-Frame-Options"]).toBe("DENY");
    expect(prod["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(prod["Strict-Transport-Security"]).toMatch(/max-age=\d+/);
    expect(prod["Permissions-Policy"]).toContain("camera=()");
  });
  it("production CSP forbids framing, plugins and foreign scripts, and upgrades http", () => {
    const csp = prod["Content-Security-Policy"];
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toMatch(/script-src 'self' 'unsafe-inline' https:\/\/js\.stripe\.com(;|$)/);
    expect(csp).toContain("https://api.stripe.com");
    expect(csp).toContain("https://hooks.stripe.com");
    expect(csp).toContain("https://*.supabase.co");
    expect(csp).toContain("https://www.youtube-nocookie.com");
  });
  it("dev CSP allows what hot reload needs, and no HSTS", () => {
    const dev = securityHeaders({ dev: true });
    expect(dev.find((h) => h.key === "Strict-Transport-Security")).toBeUndefined();
    expect(contentSecurityPolicy({ dev: true })).toContain("'unsafe-eval'");
    expect(contentSecurityPolicy({ dev: true })).not.toContain("upgrade-insecure-requests");
  });
});
