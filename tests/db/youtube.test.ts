import { afterAll, describe, expect, it, vi } from "vitest";
import { getPool } from "@/server/db";
import type { YoutubeChannel } from "@/server/providers/youtube";
import { createAdminChannel, getAdminChannel } from "@/server/services/admin-channels";
import { saveYoutubeData } from "@/server/services/youtube";
import { channel, member } from "../helpers/fixtures";
import { withRollback } from "../helpers/rollback";

afterAll(async () => {
  await getPool().end();
});

const ID = "UC_x5XG1OV2P6uZZ5FSM9Ttw";
const yt = (over: Partial<YoutubeChannel> = {}): YoutubeChannel => ({
  channelId: ID,
  title: "Chan",
  description: "",
  handle: null,
  thumbnailUrl: null,
  subscribers: 1500,
  videoCount: 2,
  videos: [
    { videoId: "aaaaaaaaaaa", title: "First", description: "one", publishedAt: "2026-01-01T00:00:00Z", thumbnailUrl: null },
    { videoId: "bbbbbbbbbbb", title: "Second", description: "two", publishedAt: "2026-02-01T00:00:00Z", thumbnailUrl: null },
  ],
  ...over,
});

describe("saveYoutubeData", () => {
  it("stores subscribers and videos, and a re-sync updates instead of duplicating", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      await saveYoutubeData(c, ch.id, yt());
      await saveYoutubeData(c, ch.id, yt({ subscribers: 2000, videos: [{ videoId: "aaaaaaaaaaa", title: "First (renamed)", description: "one", publishedAt: "2026-01-01T00:00:00Z", thumbnailUrl: null }] }));

      const row = (await c.query("select youtube_channel_id, youtube_subscribers::int as subs, youtube_synced_at from public.channels where id = $1", [ch.id])).rows[0];
      expect(row).toMatchObject({ youtube_channel_id: ID, subs: 2000 });
      expect(row.youtube_synced_at).not.toBeNull();
      const videos = (await c.query("select title, kind::text as kind from public.channel_content where channel_id = $1 order by title", [ch.id])).rows;
      expect(videos).toEqual([
        { title: "First (renamed)", kind: "video" },
        { title: "Second", kind: "video" },
      ]);
    }));

  it("refuses a YouTube channel that is already linked to another channel", () =>
    withRollback(async (c) => {
      const a = await channel(c);
      const b = await channel(c);
      await saveYoutubeData(c, a.id, yt());
      await expect(saveYoutubeData(c, b.id, yt())).rejects.toMatchObject({ code: "CONFLICT" });
    }));

  it("creating a channel with a YouTube ID imports it (provider stubbed)", () =>
    withRollback(async (c) => {
      const admin = await member(c, { role: "admin" });
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: ID, snippet: { title: "Chan", description: "" }, statistics: { subscriberCount: "42", videoCount: "1" }, contentDetails: { relatedPlaylists: { uploads: "UUx" } } }] })))
          .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ snippet: { title: "Vid", description: "", publishedAt: "2026-03-01T00:00:00Z", resourceId: { videoId: "ccccccccccc" } }, contentDetails: { videoId: "ccccccccccc" } }] }))),
      );
      try {
        const { channel: created } = await createAdminChannel(admin, { handle: "yt_import_test", name: "Imported", category: "faith", youtubeChannel: ID }, c);
        const detail = await getAdminChannel(admin, created.id, c);
        expect(detail).toMatchObject({ youtubeChannelId: ID, youtubeSubscribers: 42 });
        const n = (await c.query("select count(*)::int as n from public.channel_content where channel_id = $1 and youtube_id = 'ccccccccccc'", [created.id])).rows[0].n;
        expect(n).toBe(1);
      } finally {
        vi.unstubAllGlobals();
      }
    }));
});
