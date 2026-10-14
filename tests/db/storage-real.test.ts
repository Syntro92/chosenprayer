import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { ATTACHMENT_BUCKET } from "@/lib/community/config";
import type { Actor } from "@/server/auth/policy";
import { createAdminClient } from "@/server/auth/supabase";
import { db, getPool, one, rows } from "@/server/db";
import { getEnv } from "@/server/env";
import * as accounts from "@/server/services/accounts";
import { requestUploadUrls } from "@/server/services/attachments";
import { createPost, deletePost } from "@/server/services/posts";

/**
 * End-to-end against REAL Supabase Auth + Storage (no mocks, no rollback):
 * signed upload -> verified publish -> signed read -> delete cleans storage.
 * Everything created here is removed again in afterAll.
 */

const env = getEnv();
const admin = createAdminClient();
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const PASSWORD = "Correct-horse-9";

const users: string[] = [];
const rateKeys: string[] = [];

async function realMember(): Promise<{ actor: Actor; email: string }> {
  const email = `storage+${randomUUID().slice(0, 10)}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "Storage Tester" },
  });
  if (error) throw error;
  users.push(data.user.id);
  rateKeys.push(`upload:${data.user.id}`, `post:${data.user.id}`, `signin:delete:${data.user.id}`);
  const p = await one<{ username: string }>("select username from public.profiles where id = $1", [data.user.id]);
  return {
    email,
    actor: { userId: data.user.id, username: p!.username, displayName: "Storage Tester", role: "member", status: "active" },
  };
}

const browserStorage = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).storage.from(ATTACHMENT_BUCKET);

const objectCount = async (prefix: string) =>
  (await one<{ n: number }>("select count(*) as n from storage.objects where bucket_id = $1 and name like $2", [ATTACHMENT_BUCKET, `${prefix}%`]))!.n;

afterAll(async () => {
  for (const id of users) {
    const left = await rows<{ name: string }>("select name from storage.objects where bucket_id = $1 and name like $2", [ATTACHMENT_BUCKET, `posts/${id}/%`]);
    if (left.length) await admin.storage.from(ATTACHMENT_BUCKET).remove(left.map((l) => l.name));
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  if (rateKeys.length) await db.query("delete from public.rate_limits where key = any($1)", [rateKeys]);
  await getPool().end();
});

describe("real storage round trip", () => {
  it("signed upload -> publish -> signed read -> delete removes the stored file", async () => {
    const { actor } = await realMember();

    // 1) server hands out a one-time upload permission
    const [target] = await requestUploadUrls(actor, { files: [{ name: "pixel.png", size: PNG.length }] });
    expect(target.key).toMatch(new RegExp(`^posts/${actor.userId}/`));

    // 2) the browser uploads straight to storage with it
    const up = await browserStorage().uploadToSignedUrl(target.key, target.token, PNG, { contentType: "image/png" });
    expect(up.error).toBeNull();
    expect(await objectCount(`posts/${actor.userId}/`)).toBe(1);

    // 3) publishing verifies the real stored file
    const { post } = await createPost(actor, { text: "real upload", attachments: [{ key: target.key, name: "pixel.png" }] });
    const att = post.attachments[0];
    expect(att).toMatchObject({ kind: "image", name: "pixel.png", size: PNG.length, mime: "image/png" });

    // 4) the signed URLs really serve the bytes (inline for images, as a named download for href)
    const inline = await fetch(att.src!);
    expect(inline.status).toBe(200);
    expect(inline.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await inline.arrayBuffer()).equals(PNG)).toBe(true);
    const download = await fetch(att.href!);
    expect(download.headers.get("content-disposition")).toContain("pixel.png");

    // 5) the bucket is private: the bare object URL is refused
    const bare = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${ATTACHMENT_BUCKET}/${target.key}`);
    expect(bare.ok).toBe(false);
    // ...and so is anonymous listing
    const listed = await browserStorage().list(`posts/${actor.userId}`);
    expect(listed.data ?? []).toHaveLength(0);

    // 6) deleting the post deletes the file too
    await deletePost(actor, post.id);
    expect(await objectCount(`posts/${actor.userId}/`)).toBe(0);
    expect(await one("select 1 from public.posts where id = $1", [post.id])).toBeNull();
  });

  it("the bucket itself refuses disallowed file types, whatever the extension claims", async () => {
    const { actor } = await realMember();
    const [target] = await requestUploadUrls(actor, { files: [{ name: "evil.png", size: 20 }] });
    const up = await browserStorage().uploadToSignedUrl(target.key, target.token, Buffer.from("<script>alert(1)</script>"), {
      contentType: "text/html",
    });
    expect(up.error).not.toBeNull();
    expect(await objectCount(`posts/${actor.userId}/`)).toBe(0);
  });

  it("an upload token can't be reused for a different path", async () => {
    const { actor } = await realMember();
    const [target] = await requestUploadUrls(actor, { files: [{ name: "a.png", size: PNG.length }] });
    const other = `posts/${actor.userId}/${randomUUID()}.png`;
    const up = await browserStorage().uploadToSignedUrl(other, target.token, PNG, { contentType: "image/png" });
    expect(up.error).not.toBeNull();
  });

  it("a file claiming one type but stored as another is refused at publish time", async () => {
    const { actor } = await realMember();
    const [target] = await requestUploadUrls(actor, { files: [{ name: "doc.pdf", size: PNG.length }] });
    // stored as an image although the key says .pdf
    const up = await browserStorage().uploadToSignedUrl(target.key, target.token, PNG, { contentType: "image/png" });
    expect(up.error).toBeNull();
    await expect(createPost(actor, { text: "x", attachments: [{ key: target.key, name: "doc.pdf" }] })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("deleting an account also deletes its uploaded files, even ones never attached to a post", async () => {
    const { actor, email } = await realMember();
    const [target] = await requestUploadUrls(actor, { files: [{ name: "orphan.png", size: PNG.length }] });
    expect((await browserStorage().uploadToSignedUrl(target.key, target.token, PNG, { contentType: "image/png" })).error).toBeNull();
    expect(await objectCount(`posts/${actor.userId}/`)).toBe(1);

    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    await supabase.auth.signInWithPassword({ email, password: PASSWORD });
    await accounts.deleteMyAccount({ supabase, ip: `test-${randomUUID()}` }, actor, { password: PASSWORD });

    expect(await objectCount(`posts/${actor.userId}/`)).toBe(0);
    expect(await one("select 1 from public.profiles where id = $1", [actor.userId])).toBeNull();
  });
});
