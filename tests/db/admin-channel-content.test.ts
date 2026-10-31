import { afterAll, describe, expect, it } from "vitest";
import { getPool, type Queryable } from "@/server/db";
import { getChannelProfile } from "@/server/services/channels";
import { listAdminChannelContent, setChannelContentFeatured } from "@/server/services/admin-channel-content";
import { channel, member } from "../helpers/fixtures";
import { withRollback } from "../helpers/rollback";

afterAll(async () => {
  await getPool().end();
});

/** Three synced videos, oldest to newest. */
async function seedVideos(c: Queryable, channelId: string) {
  const ids = ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"];
  const rows: { id: string }[] = [];
  for (let i = 0; i < ids.length; i++) {
    const r = await c.query<{ id: string }>(
      `insert into public.channel_content (channel_id, kind, title, youtube_id, published_at)
       values ($1, 'video', $2, $3, now() - ($4 || ' days')::interval) returning id`,
      [channelId, `Video ${i + 1}`, ids[i], ids.length - i],
    );
    rows.push(r.rows[0]);
  }
  return rows; // rows[0] = "Video 1" (oldest), rows[2] = "Video 3" (newest)
}

describe("listAdminChannelContent / setChannelContentFeatured", () => {
  it("lists synced content most-recent first", () =>
    withRollback(async (c) => {
      const admin = await member(c, { role: "admin" });
      const ch = await channel(c);
      await seedVideos(c, ch.id);
      const list = await listAdminChannelContent(admin, ch.id, c);
      expect(list.map((i) => i.title)).toEqual(["Video 3", "Video 2", "Video 1"]);
      expect(list.every((i) => i.featuredPosition === null)).toBe(true);
    }));

  it("pins chosen items into slots, and the public page shows them in that order", () =>
    withRollback(async (c) => {
      const admin = await member(c, { role: "admin" });
      const ch = await channel(c, { status: "active" });
      const videos = await seedVideos(c, ch.id);

      // Feature the oldest video first, newest video second, middle slot on auto.
      const result = await setChannelContentFeatured(admin, ch.id, { featured: [videos[0].id, null, videos[2].id] }, c);
      expect(result.handle).toBe(ch.handle);
      const byId = new Map(result.items.map((i) => [i.id, i]));
      expect(byId.get(videos[0].id)?.featuredPosition).toBe(1);
      expect(byId.get(videos[2].id)?.featuredPosition).toBe(3);
      expect(byId.get(videos[1].id)?.featuredPosition).toBeNull();

      const { data } = await getChannelProfile(ch.handle, c);
      // Slot 1 and slot 3 picks come first (in position order), then the remaining item fills out the 3 shown.
      expect(data.content.map((i) => i.title)).toEqual(["Video 1", "Video 3", "Video 2"]);
    }));

  it("re-saving clears any previous slots instead of leaving stale pins", () =>
    withRollback(async (c) => {
      const admin = await member(c, { role: "admin" });
      const ch = await channel(c);
      const videos = await seedVideos(c, ch.id);

      await setChannelContentFeatured(admin, ch.id, { featured: [videos[0].id, videos[1].id, videos[2].id] }, c);
      const second = await setChannelContentFeatured(admin, ch.id, { featured: [videos[2].id, null, null] }, c);
      const byId = new Map(second.items.map((i) => [i.id, i]));
      expect(byId.get(videos[2].id)?.featuredPosition).toBe(1);
      expect(byId.get(videos[0].id)?.featuredPosition).toBeNull();
      expect(byId.get(videos[1].id)?.featuredPosition).toBeNull();
    }));

  it("rejects the same item in two slots", () =>
    withRollback(async (c) => {
      const admin = await member(c, { role: "admin" });
      const ch = await channel(c);
      const videos = await seedVideos(c, ch.id);
      await expect(setChannelContentFeatured(admin, ch.id, { featured: [videos[0].id, videos[0].id, null] }, c)).rejects.toMatchObject({ code: "VALIDATION" });
    }));

  it("rejects a content id from a different channel", () =>
    withRollback(async (c) => {
      const admin = await member(c, { role: "admin" });
      const a = await channel(c);
      const b = await channel(c);
      const videos = await seedVideos(c, b.id);
      await expect(setChannelContentFeatured(admin, a.id, { featured: [videos[0].id, null, null] }, c)).rejects.toMatchObject({ code: "VALIDATION" });
    }));
});
