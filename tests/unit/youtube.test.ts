import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchYoutubeChannel, parseChannelRef } from "@/server/providers/youtube";

const ID = "UC_x5XG1OV2P6uZZ5FSM9Ttw";

describe("parseChannelRef", () => {
  it("accepts an id, a channel link and handles", () => {
    expect(parseChannelRef(ID)).toEqual({ by: "id", value: ID });
    expect(parseChannelRef(`https://www.youtube.com/channel/${ID}?si=1`)).toEqual({ by: "id", value: ID });
    expect(parseChannelRef("@GoogleDevelopers")).toEqual({ by: "handle", value: "GoogleDevelopers" });
    expect(parseChannelRef("https://youtube.com/@GoogleDevelopers")).toEqual({ by: "handle", value: "GoogleDevelopers" });
  });
  it("rejects anything else", () => {
    expect(() => parseChannelRef("hello world")).toThrow();
    expect(() => parseChannelRef("UCshort")).toThrow();
  });
});

describe("fetchYoutubeChannel", () => {
  afterEach(() => vi.unstubAllGlobals());
  const stub = (responses: unknown[]) => {
    const fn = vi.fn();
    for (const r of responses) fn.mockResolvedValueOnce(new Response(JSON.stringify(r), { status: 200 }));
    vi.stubGlobal("fetch", fn);
    return fn;
  };

  it("maps subscribers and skips private/deleted videos", async () => {
    const fn = stub([
      { items: [{ id: ID, snippet: { title: "Chan", description: "d", customUrl: "@chan", thumbnails: { medium: { url: "https://i/x.jpg" } } }, statistics: { subscriberCount: "1234", videoCount: "9" }, contentDetails: { relatedPlaylists: { uploads: "UUx" } } }] },
      { items: [
        { snippet: { title: "Hello", description: "desc", publishedAt: "2026-01-01T00:00:00Z", resourceId: { videoId: "aaaaaaaaaaa" } }, contentDetails: { videoId: "aaaaaaaaaaa", videoPublishedAt: "2026-01-02T00:00:00Z" } },
        { snippet: { title: "Private video", description: "", publishedAt: "2026-01-01T00:00:00Z", resourceId: { videoId: "bbbbbbbbbbb" } }, contentDetails: { videoId: "bbbbbbbbbbb" } },
      ] },
    ]);
    const c = await fetchYoutubeChannel(ID);
    expect(c).toMatchObject({ channelId: ID, title: "Chan", handle: "chan", subscribers: 1234, videoCount: 9 });
    expect(c.videos).toHaveLength(1);
    expect(c.videos[0]).toMatchObject({ videoId: "aaaaaaaaaaa", publishedAt: "2026-01-02T00:00:00Z" });
    // The key travels in a header, never in the URL.
    expect(String(fn.mock.calls[0][0])).not.toContain("key=");
  });

  it("returns null subscribers when hidden, and NOT_FOUND for an unknown channel", async () => {
    stub([
      { items: [{ id: ID, snippet: { title: "Chan", description: "" }, statistics: { hiddenSubscriberCount: true, videoCount: "0" }, contentDetails: { relatedPlaylists: { uploads: "UUx" } } }] },
      { items: [] },
    ]);
    expect((await fetchYoutubeChannel(ID)).subscribers).toBeNull();
    stub([{}]);
    await expect(fetchYoutubeChannel(ID)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
