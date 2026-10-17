import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getPool, type Queryable } from "@/server/db";
import { createAdminChannel, updateAdminChannel } from "@/server/services/admin-channels";
import { uploadChannelImage } from "@/server/services/admin-channel-images";
import { channelImageUrl } from "@/server/storage";
import { getChannelProfile } from "@/server/services/channels";
import { member } from "../helpers/fixtures";
import { withRollback } from "../helpers/rollback";

afterAll(async () => {
  await getPool().end();
});

const handleOf = () => `img_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
const newChannel = (over: Record<string, unknown> = {}) => ({ handle: handleOf(), name: "Pictured", category: "faith", ...over });

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

class FakeStore {
  uploaded: { path: string; type: string }[] = [];
  async upload(path: string, _bytes: Uint8Array, type: string) {
    this.uploaded.push({ path, type });
  }
}

/** Pretend the upload endpoint stored `path` (the real file lives in Supabase Storage). */
async function stored(c: Queryable, ext = "png") {
  const path = `channels/${randomUUID()}.${ext}`;
  await c.query("insert into storage.objects (bucket_id, name, metadata) values ('channel-images', $1, '{}'::jsonb)", [path]);
  return path;
}

describe("uploadChannelImage", () => {
  it("is admin only", () =>
    withRollback(async (c) => {
      const m = await member(c);
      await expect(uploadChannelImage(m, { name: "a.png", bytes: PNG }, new FakeStore())).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(uploadChannelImage(null, { name: "a.png", bytes: PNG }, new FakeStore())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    }));

  it("stores JPG, PNG and WebP under a server-made key and returns the public URL", () =>
    withRollback(async (c) => {
      const a = await member(c, { role: "admin" });
      const store = new FakeStore();
      const png = await uploadChannelImage(a, { name: "Logo.PNG", bytes: PNG }, store);
      const jpeg = await uploadChannelImage(a, { name: "photo.jpeg", bytes: JPG }, store);
      const webp = await uploadChannelImage(a, { name: "cover.webp", bytes: WEBP }, store);
      expect(png.path).toMatch(/^channels\/[0-9a-f-]{36}\.png$/);
      expect(jpeg.path).toMatch(/\.jpg$/);
      expect(webp.path).toMatch(/\.webp$/);
      expect(png.url).toBe(channelImageUrl(png.path));
      expect(png.url).toContain("/storage/v1/object/public/channel-images/channels/");
      expect(store.uploaded.map((u) => u.type)).toEqual(["image/png", "image/jpeg", "image/webp"]);
    }));

  it("rejects wrong types, fake images, empty and oversized files", () =>
    withRollback(async (c) => {
      const a = await member(c, { role: "admin" });
      const store = new FakeStore();
      const reject = (file: { name: string; bytes: Uint8Array }) => expect(uploadChannelImage(a, file, store)).rejects.toMatchObject({ code: "VALIDATION" });
      await reject({ name: "doc.pdf", bytes: PNG });
      await reject({ name: "anim.gif", bytes: PNG });
      await reject({ name: "script.png", bytes: new TextEncoder().encode("<script>alert(1)</script>") });
      await reject({ name: "empty.png", bytes: new Uint8Array(0) });
      await reject({ name: "big.png", bytes: Uint8Array.from({ length: 4 * 1024 * 1024 + 1 }, (_, i) => (i < 4 ? PNG[i] : 0)) });
      expect(store.uploaded).toEqual([]);
    }));
});

describe("channel images on create / update", () => {
  it("saves the images with a new channel and returns their URLs", () =>
    withRollback(async (c) => {
      const a = await member(c, { role: "admin" });
      const avatarPath = await stored(c);
      const { channel: ch } = await createAdminChannel(a, newChannel({ avatarPath }), c);
      expect(ch).toMatchObject({ avatarPath, avatarUrl: channelImageUrl(avatarPath) });
      const profile = await getChannelProfile(ch.handle, c);
      expect(profile.channel).toMatchObject({ avatarUrl: channelImageUrl(avatarPath) });
      // Channels no longer have a cover image: nothing about one is stored or returned.
      expect(ch).not.toHaveProperty("coverPath");
      expect(profile.channel).not.toHaveProperty("coverUrl");
    }));

  it("defaults to no images", () =>
    withRollback(async (c) => {
      const a = await member(c, { role: "admin" });
      const { channel: ch } = await createAdminChannel(a, newChannel(), c);
      expect(ch).toMatchObject({ avatarPath: null, avatarUrl: null });
    }));

  it("replaces and removes images on update; omitting them leaves them alone", () =>
    withRollback(async (c) => {
      const a = await member(c, { role: "admin" });
      const first = await stored(c);
      const { channel: ch } = await createAdminChannel(a, newChannel({ avatarPath: first }), c);

      const untouched = await updateAdminChannel(a, ch.id, { name: "Renamed" }, c);
      expect(untouched.channel.avatarPath).toBe(first);

      const second = await stored(c);
      const replaced = await updateAdminChannel(a, ch.id, { avatarPath: second }, c);
      expect(replaced.channel).toMatchObject({ avatarPath: second });

      const removed = await updateAdminChannel(a, ch.id, { avatarPath: null }, c);
      expect(removed.channel).toMatchObject({ avatarPath: null, avatarUrl: null });
    }));

  it("refuses keys that are malformed or were never uploaded", () =>
    withRollback(async (c) => {
      const a = await member(c, { role: "admin" });
      // well-formed key, but no such file in the bucket
      await expect(createAdminChannel(a, newChannel({ avatarPath: `channels/${randomUUID()}.png` }), c)).rejects.toMatchObject({ code: "VALIDATION" });
      // malformed / path traversal: rejected by the schema (zod), before any query
      for (const bad of ["../secrets.png", "posts/x/y.png", "channels/abc.png", "https://evil.example/x.png"]) {
        await expect(createAdminChannel(a, newChannel({ avatarPath: bad }), c)).rejects.toThrow();
      }
    }));
});
