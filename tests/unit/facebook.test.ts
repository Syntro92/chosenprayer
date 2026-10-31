import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFacebookPage, parsePageRef } from "@/server/providers/facebook";

// Unlike YOUTUBE_API_KEY, FACEBOOK_ACCESS_TOKEN isn't in .env yet (the feature is new); a
// placeholder is enough since every network call in this file is stubbed.
process.env.FACEBOOK_ACCESS_TOKEN ??= "test-token";

const ID = "100064012345678";

describe("parsePageRef", () => {
  it("accepts an id, page links and a bare username", () => {
    expect(parsePageRef(ID)).toEqual({ by: "id", value: ID });
    expect(parsePageRef(`https://www.facebook.com/profile.php?id=${ID}`)).toEqual({ by: "id", value: ID });
    expect(parsePageRef("https://www.facebook.com/CocaCola")).toEqual({ by: "username", value: "CocaCola" });
    expect(parsePageRef("CocaCola")).toEqual({ by: "username", value: "CocaCola" });
  });
  it("rejects anything else", () => {
    expect(() => parsePageRef("hello world!!")).toThrow();
    expect(() => parsePageRef("ab")).toThrow();
  });
});

describe("fetchFacebookPage", () => {
  afterEach(() => vi.unstubAllGlobals());
  const ok = (responses: unknown[]) => {
    const fn = vi.fn();
    for (const r of responses) fn.mockResolvedValueOnce(new Response(JSON.stringify(r), { status: 200 }));
    vi.stubGlobal("fetch", fn);
    return fn;
  };
  const failing = (status: number, body: unknown) => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));

  it("maps followers and recent posts", async () => {
    const fn = ok([
      { id: ID, name: "Page", about: "d", username: "page", followers_count: 1234, picture: { data: { url: "https://i/x.jpg" } } },
      { data: [{ id: "123_456", message: "Hello\nworld", created_time: "2026-01-02T00:00:00Z", full_picture: "https://i/p.jpg", permalink_url: "https://fb/p" }] },
    ]);
    const p = await fetchFacebookPage(ID);
    expect(p).toMatchObject({ pageId: ID, title: "Page", username: "page", followers: 1234 });
    expect(p.posts).toHaveLength(1);
    expect(p.posts[0]).toMatchObject({ postId: "123_456", message: "Hello\nworld", createdAt: "2026-01-02T00:00:00Z" });
    // The token travels as a query param (Facebook's own Graph API contract for app/page tokens).
    expect(String(fn.mock.calls[0][0])).toContain("access_token=");
  });

  it("falls back to fan_count when followers_count is absent", async () => {
    ok([{ id: ID, name: "Page", fan_count: 42 }, { data: [] }]);
    expect((await fetchFacebookPage(ID)).followers).toBe(42);
  });

  it("maps an unknown page to NOT_FOUND", async () => {
    failing(400, { error: { code: 100, message: "Unsupported get request." } });
    await expect(fetchFacebookPage(ID)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("maps a rate-limit error to UNAVAILABLE", async () => {
    failing(400, { error: { code: 32, message: "Page request limit reached" } });
    await expect(fetchFacebookPage(ID)).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });
});
