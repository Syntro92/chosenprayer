import { afterAll, describe, expect, it, vi } from "vitest";
import { getPool } from "@/server/db";
import type { FacebookPage } from "@/server/providers/facebook";
import { createAdminChannel, getAdminChannel } from "@/server/services/admin-channels";
import { saveFacebookData } from "@/server/services/facebook";
import { channel, member } from "../helpers/fixtures";
import { withRollback } from "../helpers/rollback";

// Unlike YOUTUBE_API_KEY, FACEBOOK_ACCESS_TOKEN isn't in .env yet (the feature is new); a
// placeholder is enough since every network call in this file is stubbed.
process.env.FACEBOOK_ACCESS_TOKEN ??= "test-token";

afterAll(async () => {
  await getPool().end();
});

const ID = "100064012345678";
const fb = (over: Partial<FacebookPage> = {}): FacebookPage => ({
  pageId: ID,
  title: "Page",
  description: "",
  username: null,
  thumbnailUrl: null,
  followers: 1500,
  posts: [
    { postId: "aaa_1", message: "First", createdAt: "2026-01-01T00:00:00Z", thumbnailUrl: null, permalinkUrl: null },
    { postId: "bbb_2", message: "Second", createdAt: "2026-02-01T00:00:00Z", thumbnailUrl: null, permalinkUrl: null },
  ],
  ...over,
});

describe("saveFacebookData", () => {
  it("stores followers and posts, and a re-sync updates instead of duplicating", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      await saveFacebookData(c, ch.id, fb());
      await saveFacebookData(c, ch.id, fb({ followers: 2000, posts: [{ postId: "aaa_1", message: "First (renamed)", createdAt: "2026-01-01T00:00:00Z", thumbnailUrl: null, permalinkUrl: null }] }));

      const row = (await c.query("select facebook_page_id, facebook_followers::int as followers, facebook_synced_at from public.channels where id = $1", [ch.id])).rows[0];
      expect(row).toMatchObject({ facebook_page_id: ID, followers: 2000 });
      expect(row.facebook_synced_at).not.toBeNull();
      const posts = (await c.query("select title, kind::text as kind from public.channel_content where channel_id = $1 order by title", [ch.id])).rows;
      expect(posts).toEqual([
        { title: "First (renamed)", kind: "story" },
        { title: "Second", kind: "story" },
      ]);
    }));

  it("refuses a Facebook Page that is already linked to another channel", () =>
    withRollback(async (c) => {
      const a = await channel(c);
      const b = await channel(c);
      await saveFacebookData(c, a.id, fb());
      await expect(saveFacebookData(c, b.id, fb())).rejects.toMatchObject({ code: "CONFLICT" });
    }));

  it("creating a channel with a Facebook Page ID imports it (provider stubbed)", () =>
    withRollback(async (c) => {
      const admin = await member(c, { role: "admin" });
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce(new Response(JSON.stringify({ id: ID, name: "Page", fan_count: 42 })))
          .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "ccc_3", message: "Post", created_time: "2026-03-01T00:00:00Z" }] }))),
      );
      try {
        const { channel: created } = await createAdminChannel(admin, { handle: "fb_import_test", name: "Imported", category: "faith", facebookPage: ID }, c);
        const detail = await getAdminChannel(admin, created.id, c);
        expect(detail).toMatchObject({ facebookPageId: ID, facebookFollowers: 42 });
        const n = (await c.query("select count(*)::int as n from public.channel_content where channel_id = $1 and facebook_id = 'ccc_3'", [created.id])).rows[0].n;
        expect(n).toBe(1);
      } finally {
        vi.unstubAllGlobals();
      }
    }));
});
