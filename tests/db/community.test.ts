import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getPool, type Queryable } from "@/server/db";
import { requestUploadUrls } from "@/server/services/attachments";
import { addComment, deleteComment, editComment, listComments, setCommentLike } from "@/server/services/comments";
import { listNotifications, markNotificationsRead } from "@/server/services/notifications";
import { createPost, deletePost, editPost, getPost, listFeed, listMemberPosts, setPostLike } from "@/server/services/posts";
import { reportComment, reportPost } from "@/server/services/reports";
import { FakeStorage, key, member, putObject, saturate } from "../helpers/fixtures";
import { withRollback } from "../helpers/rollback";

afterAll(async () => {
  await getPool().end();
});

/** Creates a post directly, optionally back-dated, bypassing rate limits. */
async function rawPost(c: Queryable, authorId: string, body: string, minutesAgo = 0) {
  const { rows } = await c.query<{ id: string }>(
    "insert into public.posts (author_id, body, created_at) values ($1, $2, now() - ($3 || ' minutes')::interval) returning id",
    [authorId, body, String(minutesAgo)],
  );
  return rows[0].id;
}
const store = () => new FakeStorage();

/* ======================================================================== */
describe("requestUploadUrls", () => {
  it("returns a one-time target per file, under the user's own folder", () =>
    withRollback(async (c) => {
      const me = await member(c);
      const targets = await requestUploadUrls(me, { files: [{ name: "Sunrise.PNG", size: 1000 }, { name: "notes.pdf", size: 2000 }] }, c, store());
      expect(targets).toHaveLength(2);
      expect(targets[0].key).toMatch(new RegExp(`^posts/${me.userId}/[0-9a-f-]{36}\\.png$`));
      expect(targets[1].key).toMatch(/\.pdf$/);
      expect(targets[0].token).toBeTruthy();
      expect(targets[0].name).toBe("Sunrise.PNG");
    }));

  it("rejects unsupported types, oversize files, too many files and too many images", () =>
    withRollback(async (c) => {
      const me = await member(c);
      const ask = (files: { name: string; size: number }[]) => requestUploadUrls(me, { files }, c, store());
      await expect(ask([{ name: "virus.exe", size: 10 }])).rejects.toMatchObject({ code: "VALIDATION" });
      await expect(ask([{ name: "a.png", size: 5 * 1024 * 1024 + 1 }])).rejects.toMatchObject({ name: "ZodError" });
      await expect(ask([{ name: "a.png", size: 0 }])).rejects.toMatchObject({ name: "ZodError" });
      await expect(ask([])).rejects.toMatchObject({ name: "ZodError" });
      await expect(ask(Array.from({ length: 7 }, (_, i) => ({ name: `f${i}.pdf`, size: 10 })))).rejects.toMatchObject({ name: "ZodError" });
      await expect(ask(Array.from({ length: 5 }, (_, i) => ({ name: `i${i}.png`, size: 10 })))).rejects.toMatchObject({ code: "VALIDATION" });
    }));

  it("requires a member and is rate limited", () =>
    withRollback(async (c) => {
      const me = await member(c);
      await expect(requestUploadUrls(null, { files: [{ name: "a.png", size: 1 }] }, c, store())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      await saturate(c, "upload", me.userId);
      await expect(requestUploadUrls(me, { files: [{ name: "a.png", size: 1 }] }, c, store())).rejects.toMatchObject({ code: "RATE_LIMITED" });
    }));
});

/* ======================================================================== */
describe("createPost", () => {
  it("publishes a text post and returns it ready to display", () =>
    withRollback(async (c) => {
      const me = await member(c, { name: "Nimali Perera" });
      const { post, members } = await createPost(me, { text: "  Hello community  " }, c, store());
      expect(post).toMatchObject({
        authorId: me.userId,
        text: "Hello community",
        attachments: [],
        baseLikes: 0,
        commentCount: 0,
        likedByMe: false,
      });
      expect(post.ageMinutes).toBeLessThan(1);
      expect(members[0]).toMatchObject({ id: me.userId, name: "Nimali Perera" });
      expect(members[0].tone).toMatch(/^bg-/);
      expect(JSON.stringify(members)).not.toContain("@example.com"); // never leaks email
    }));

  it("needs text or an attachment, and respects the length limit", () =>
    withRollback(async (c) => {
      const me = await member(c);
      await expect(createPost(me, { text: "   " }, c, store())).rejects.toMatchObject({ code: "VALIDATION" });
      await expect(createPost(me, {}, c, store())).rejects.toMatchObject({ code: "VALIDATION" });
      await expect(createPost(me, { text: "x".repeat(1001) }, c, store())).rejects.toMatchObject({ name: "ZodError" });
      expect((await createPost(me, { text: "x".repeat(1000) }, c, store())).post.text).toHaveLength(1000);
    }));

  it("requires an active member", () =>
    withRollback(async (c) => {
      await expect(createPost(null, { text: "hi" }, c, store())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      const banned = await member(c, { status: "suspended" });
      await expect(createPost(banned, { text: "hi" }, c, store())).rejects.toMatchObject({ code: "FORBIDDEN" });
    }));

  it("is rate limited", () =>
    withRollback(async (c) => {
      const me = await member(c);
      await saturate(c, "post", me.userId);
      await expect(createPost(me, { text: "spam" }, c, store())).rejects.toMatchObject({ code: "RATE_LIMITED" });
    }));

  describe("with attachments", () => {
    it("saves verified uploads and returns signed URLs (images inline, every file downloadable)", () =>
      withRollback(async (c) => {
        const me = await member(c);
        const img = key(me.userId, "png");
        const doc = key(me.userId, "pdf");
        await putObject(c, img, 4000, "image/png");
        await putObject(c, doc, 9000, "application/pdf");
        const { post } = await createPost(
          me,
          { text: "With files", attachments: [{ key: img, name: "sunrise.png" }, { key: doc, name: "My Notes.pdf" }] },
          c,
          store(),
        );
        expect(post.attachments).toHaveLength(2);
        const [a, b] = post.attachments;
        expect(a).toMatchObject({ kind: "image", name: "sunrise.png", size: 4000, mime: "image/png", alt: "sunrise.png" });
        expect(a.src).toContain(img);
        expect(a.href).toContain("download=sunrise.png");
        expect(b).toMatchObject({ kind: "file", name: "My Notes.pdf", size: 9000, mime: "application/pdf" });
        expect(b.src).toBeUndefined();
        expect(b.href).toContain("download=My%20Notes.pdf");
      }));

    it("allows an attachment-only post", () =>
      withRollback(async (c) => {
        const me = await member(c);
        const k = key(me.userId, "jpg");
        await putObject(c, k, 100, "image/jpeg");
        const { post } = await createPost(me, { attachments: [{ key: k, name: "p.jpg" }] }, c, store());
        expect(post.text).toBe("");
        expect(post.attachments).toHaveLength(1);
      }));

    it("takes type and size from storage, not from the browser", () =>
      withRollback(async (c) => {
        const me = await member(c);
        const k = key(me.userId, "png");
        await putObject(c, k, 777, "image/png");
        const { post } = await createPost(me, { attachments: [{ key: k, name: "claimed-huge.png", size: 1, mime: "text/html" }] }, c, store());
        expect(post.attachments[0]).toMatchObject({ size: 777, mime: "image/png" });
      }));

    const bad: [string, (me: { userId: string }, c: Queryable) => Promise<{ key: string; name: string }[]>][] = [
      ["a file that never finished uploading", async (me) => [{ key: key(me.userId), name: "ghost.png" }]],
      ["someone else's file", async (me, c) => {
        const other = key(randomUUID());
        await putObject(c, other, 10, "image/png");
        return [{ key: other, name: "stolen.png" }];
      }],
      ["a path that isn't ours at all", async () => [{ key: "../../etc/passwd", name: "x.png" }]],
      ["a type that doesn't match its extension", async (me, c) => {
        const k = key(me.userId, "png");
        await putObject(c, k, 10, "application/pdf");
        return [{ key: k, name: "liar.png" }];
      }],
      ["a file over 5 MB", async (me, c) => {
        const k = key(me.userId, "pdf");
        await putObject(c, k, 5 * 1024 * 1024 + 1, "application/pdf");
        return [{ key: k, name: "big.pdf" }];
      }],
      ["the same file twice", async (me, c) => {
        const k = key(me.userId);
        await putObject(c, k, 10, "image/png");
        return [{ key: k, name: "a.png" }, { key: k, name: "a.png" }];
      }],
      ["more than 4 images", async (me, c) => {
        const refs = [];
        for (let i = 0; i < 5; i++) {
          const k = key(me.userId);
          await putObject(c, k, 10, "image/png");
          refs.push({ key: k, name: `i${i}.png` });
        }
        return refs;
      }],
    ];
    for (const [name, build] of bad) {
      it(`rejects ${name}`, () =>
        withRollback(async (c) => {
          const me = await member(c);
          const attachments = await build(me, c);
          await expect(createPost(me, { text: "x", attachments }, c, store())).rejects.toMatchObject({ code: "VALIDATION" });
        }));
    }

    it("rejects more than 6 attachments", () =>
      withRollback(async (c) => {
        const me = await member(c);
        const refs = Array.from({ length: 7 }, (_, i) => ({ key: key(me.userId, "pdf"), name: `d${i}.pdf` }));
        await expect(createPost(me, { text: "x", attachments: refs }, c, store())).rejects.toMatchObject({ name: "ZodError" });
      }));
  });
});

/* ======================================================================== */
describe("listFeed", () => {
  const ids = async (c: Queryable, me: Parameters<typeof listFeed>[0], q: Parameters<typeof listFeed>[1]) =>
    (await listFeed(me, q, c, store())).posts.map((p) => p.text);

  it("latest first, visible posts only", () =>
    withRollback(async (c) => {
      const me = await member(c);
      const other = await member(c);
      await rawPost(c, me.userId, "oldest", 30);
      await rawPost(c, other.userId, "middle", 20);
      await rawPost(c, me.userId, "newest", 10);
      const hidden = await rawPost(c, other.userId, "removed", 5);
      await c.query("update public.posts set status = 'removed', removed_at = now() where id = $1", [hidden]);
      const feed = await listFeed(me, { q: undefined }, c, store());
      const mine = feed.posts.filter((p) => ["oldest", "middle", "newest", "removed"].includes(p.text)).map((p) => p.text);
      expect(mine).toEqual(["newest", "middle", "oldest"]);
      expect(feed.members.map((m) => m.id)).toEqual(expect.arrayContaining([me.userId, other.userId]));
    }));

  it("requires a member", () =>
    withRollback(async (c) => {
      await expect(listFeed(null, {}, c, store())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    }));

  it("tab=mine shows only my posts", () =>
    withRollback(async (c) => {
      const me = await member(c);
      const other = await member(c);
      await rawPost(c, me.userId, "mine-1");
      await rawPost(c, other.userId, "theirs");
      expect(await ids(c, me, { tab: "mine" })).toEqual(["mine-1"]);
    }));

  it("filter=media shows only posts with attachments", () =>
    withRollback(async (c) => {
      const me = await member(c);
      await rawPost(c, me.userId, "plain");
      const withFile = await rawPost(c, me.userId, "has-file");
      await c.query(
        "insert into public.post_attachments (post_id, kind, name, size_bytes, mime, storage_path) values ($1,'file','a.pdf',10,'application/pdf',$2)",
        [withFile, key(me.userId, "pdf")],
      );
      expect(await ids(c, me, { tab: "mine", filter: "media" })).toEqual(["has-file"]);
    }));

  it("search matches text, author name, username and attachment names, case-insensitively", () =>
    withRollback(async (c) => {
      const t = `zz${randomUUID().slice(0, 8)}`;
      const me = await member(c, { name: `${t} Author` });
      const other = await member(c);
      await rawPost(c, other.userId, `about ${t} sunrise`);
      await rawPost(c, me.userId, "unrelated text");
      const fileHolder = await rawPost(c, other.userId, "has a file");
      await c.query(
        "insert into public.post_attachments (post_id, kind, name, size_bytes, mime, storage_path) values ($1,'file',$2,10,'application/pdf',$3)",
        [fileHolder, `${t}-report.pdf`, key(other.userId, "pdf")],
      );
      const found = await ids(c, me, { q: t.toUpperCase() });
      expect(found).toEqual(expect.arrayContaining([`about ${t} sunrise`, "unrelated text", "has a file"]));
      expect(found).toHaveLength(3);
      expect(await ids(c, me, { q: `${t} author` })).toEqual(["unrelated text"]);
    }));

  it("treats % and _ in the search literally", () =>
    withRollback(async (c) => {
      const t = `zz${randomUUID().slice(0, 8)}`;
      const me = await member(c);
      await rawPost(c, me.userId, `${t} 100% sure`);
      await rawPost(c, me.userId, `${t} 1000 sure`);
      expect(await ids(c, me, { q: `${t} 100% sure` })).toEqual([`${t} 100% sure`]);
    }));

  it("popular: orders by likes + 2x comments, newest first on ties", () =>
    withRollback(async (c) => {
      const t = `zz${randomUUID().slice(0, 8)}`;
      const me = await member(c);
      const fans = [await member(c), await member(c), await member(c)];
      const low = await rawPost(c, me.userId, `${t} low`, 5);
      const likes = await rawPost(c, me.userId, `${t} likes`, 20); // 3 likes = 3
      const talk = await rawPost(c, me.userId, `${t} talk`, 30); // 2 comments = 4
      const tieNew = await rawPost(c, me.userId, `${t} tie-new`, 1); // 0
      for (const f of fans) await c.query("insert into public.post_likes (post_id, user_id) values ($1,$2)", [likes, f.userId]);
      for (const f of fans.slice(0, 2)) await c.query("insert into public.comments (post_id, author_id, body) values ($1,$2,'hi')", [talk, f.userId]);
      void low; void tieNew;
      expect(await ids(c, me, { q: t, filter: "popular" })).toEqual([`${t} talk`, `${t} likes`, `${t} tie-new`, `${t} low`]);
    }));

  for (const filter of ["latest", "popular"] as const) {
    it(`${filter}: walking every page returns each post exactly once, in order`, () =>
      withRollback(async (c) => {
        const t = `zz${randomUUID().slice(0, 8)}`;
        const me = await member(c);
        const likers = [await member(c), await member(c)];
        const made: string[] = [];
        for (let i = 0; i < 7; i++) made.push(await rawPost(c, me.userId, `${t} p${i}`, 50 - i));
        // give some posts equal / different scores so the tie-break path is exercised
        await c.query("insert into public.post_likes (post_id, user_id) values ($1,$2),($1,$3)", [made[2], likers[0].userId, likers[1].userId]);
        await c.query("insert into public.post_likes (post_id, user_id) values ($1,$2)", [made[4], likers[0].userId]);
        await c.query("insert into public.post_likes (post_id, user_id) values ($1,$2)", [made[5], likers[0].userId]);

        const all = (await listFeed(me, { q: t, filter, limit: 30 }, c, store())).posts.map((p) => p.id);
        const walked: string[] = [];
        let cursor: string | undefined;
        let pages = 0;
        do {
          const page = await listFeed(me, { q: t, filter, limit: 3, cursor }, c, store());
          walked.push(...page.posts.map((p) => p.id));
          cursor = page.nextCursor ?? undefined;
          pages++;
        } while (cursor && pages < 10);
        expect(pages).toBe(3);
        expect(walked).toEqual(all);
        expect(new Set(walked).size).toBe(7);
      }));
  }

  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const cursors: [string, Parameters<typeof listFeed>[1]][] = [
    ["garbage", { cursor: "garbage" }],
    ["not a uuid", { cursor: enc({ k: "2025-01-01T00:00:00Z", id: "nope" }) }],
    ["not a date", { cursor: enc({ k: "yesterday", id: randomUUID() }) }],
    ["number for latest", { cursor: enc({ k: 5, id: randomUUID() }) }],
    ["bad popular shape", { filter: "popular", cursor: enc({ k: "abc|2025-01-01T00:00:00Z", id: randomUUID() }) }],
  ];
  for (const [name, input] of cursors) {
    it(`rejects a tampered cursor: ${name}`, () =>
      withRollback(async (c) => {
        const me = await member(c);
        await expect(listFeed(me, input, c, store())).rejects.toMatchObject({ code: "VALIDATION" });
      }));
  }

  it("reports what the viewer already liked, with baseLikes excluding their own like", () =>
    withRollback(async (c) => {
      const me = await member(c);
      const other = await member(c);
      const p = await rawPost(c, other.userId, "like-me");
      await c.query("insert into public.post_likes (post_id, user_id) values ($1,$2),($1,$3)", [p, me.userId, other.userId]);
      const mine = (await listFeed(me, { q: "like-me" }, c, store())).posts[0];
      expect(mine).toMatchObject({ likedByMe: true, baseLikes: 1 });
      const theirs = (await listFeed(other, { q: "like-me" }, c, store())).posts[0];
      expect(theirs).toMatchObject({ likedByMe: true, baseLikes: 1 });
      const stranger = await member(c);
      expect((await listFeed(stranger, { q: "like-me" }, c, store())).posts[0]).toMatchObject({ likedByMe: false, baseLikes: 2 });
    }));
});

/* ======================================================================== */
describe("getPost", () => {
  it("returns a visible post with its author", () =>
    withRollback(async (c) => {
      const me = await member(c);
      const id = await rawPost(c, me.userId, "single");
      const { post, members } = await getPost(me, id, c, store());
      expect(post.id).toBe(id);
      expect(members[0].id).toBe(me.userId);
    }));

  it("404s for malformed, unknown and removed posts; requires a member", () =>
    withRollback(async (c) => {
      const me = await member(c);
      const removed = await rawPost(c, me.userId, "gone");
      await c.query("update public.posts set status = 'removed', removed_at = now() where id = $1", [removed]);
      for (const id of ["nope", randomUUID(), removed]) await expect(getPost(me, id, c, store())).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(getPost(null, removed, c, store())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    }));
});

describe("listMemberPosts", () => {
  it("returns the member and only their posts, paginated", () =>
    withRollback(async (c) => {
      const viewer = await member(c);
      const target = await member(c, { name: "Anjali Rao" });
      const other = await member(c);
      for (let i = 0; i < 4; i++) await rawPost(c, target.userId, `t${i}`, 10 - i);
      await rawPost(c, other.userId, "not-theirs");
      const p1 = await listMemberPosts(viewer, target.username, { limit: 3 }, c, store());
      expect(p1.member).toMatchObject({ id: target.userId, name: "Anjali Rao", username: target.username });
      expect(p1.posts.map((p) => p.text)).toEqual(["t3", "t2", "t1"]);
      const p2 = await listMemberPosts(viewer, target.username, { limit: 3, cursor: p1.nextCursor! }, c, store());
      expect(p2.posts.map((p) => p.text)).toEqual(["t0"]);
      expect(p2.nextCursor).toBeNull();
    }));

  it("404s for unknown or suspended members and requires a member", () =>
    withRollback(async (c) => {
      const viewer = await member(c);
      const banned = await member(c, { status: "suspended" });
      await expect(listMemberPosts(viewer, "no_such_person_x", {}, c, store())).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(listMemberPosts(viewer, banned.username, {}, c, store())).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(listMemberPosts(viewer, "../x", {}, c, store())).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(listMemberPosts(null, viewer.username, {}, c, store())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    }));
});

/* ======================================================================== */
describe("editPost / deletePost", () => {
  it("lets the author edit, and marks it edited", () =>
    withRollback(async (c) => {
      const me = await member(c);
      const id = await rawPost(c, me.userId, "before");
      expect(await editPost(me, id, { text: "  after  " }, c)).toEqual({ text: "after" });
      const { post } = await getPost(me, id, c, store());
      expect(post).toMatchObject({ text: "after", edited: true });
    }));

  it("blocks other people, empty text and unknown posts", () =>
    withRollback(async (c) => {
      const me = await member(c);
      const other = await member(c);
      const id = await rawPost(c, me.userId, "mine");
      await expect(editPost(other, id, { text: "hijack" }, c)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(editPost(me, id, { text: "   " }, c)).rejects.toMatchObject({ code: "VALIDATION" });
      await expect(editPost(me, id, { text: "x".repeat(1001) }, c)).rejects.toMatchObject({ name: "ZodError" });
      await expect(editPost(me, randomUUID(), { text: "x" }, c)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(editPost(null, id, { text: "x" }, c)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    }));

  it("allows clearing the text of a post that has an attachment", () =>
    withRollback(async (c) => {
      const me = await member(c);
      const id = await rawPost(c, me.userId, "caption");
      await c.query(
        "insert into public.post_attachments (post_id, kind, name, size_bytes, mime, storage_path) values ($1,'image','a.png',10,'image/png',$2)",
        [id, key(me.userId)],
      );
      expect(await editPost(me, id, { text: "" }, c)).toEqual({ text: "" });
    }));

  it("delete removes the post, its comments, likes and stored files", () =>
    withRollback(async (c) => {
      const me = await member(c);
      const other = await member(c);
      const s = store();
      const id = await rawPost(c, me.userId, "doomed");
      const k = key(me.userId);
      await c.query("insert into public.post_attachments (post_id, kind, name, size_bytes, mime, storage_path) values ($1,'image','a.png',10,'image/png',$2)", [id, k]);
      await c.query("insert into public.comments (post_id, author_id, body) values ($1,$2,'c')", [id, other.userId]);
      await c.query("insert into public.post_likes (post_id, user_id) values ($1,$2)", [id, other.userId]);

      await expect(deletePost(other, id, c, s)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await deletePost(me, id, c, s);
      expect((await c.query("select 1 from public.posts where id = $1", [id])).rowCount).toBe(0);
      expect((await c.query("select 1 from public.comments where post_id = $1", [id])).rowCount).toBe(0);
      expect((await c.query("select 1 from public.post_likes where post_id = $1", [id])).rowCount).toBe(0);
      expect(s.removed).toEqual([k]);
      await expect(deletePost(me, id, c, s)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }));
});

/* ======================================================================== */
describe("likes on posts", () => {
  it("like and unlike are idempotent and keep the count exact", () =>
    withRollback(async (c) => {
      const author = await member(c);
      const fan = await member(c);
      const id = await rawPost(c, author.userId, "like me");
      expect(await setPostLike(fan, id, true, c)).toEqual({ liked: true, likeCount: 1 });
      expect(await setPostLike(fan, id, true, c)).toEqual({ liked: true, likeCount: 1 });
      expect(await setPostLike(fan, id, false, c)).toEqual({ liked: false, likeCount: 0 });
      expect(await setPostLike(fan, id, false, c)).toEqual({ liked: false, likeCount: 0 });
    }));

  it("notifies the author once, never about their own like, and survives like/unlike spam", () =>
    withRollback(async (c) => {
      const author = await member(c, { name: "Author" });
      const fan = await member(c, { name: "Kasun Fernando" });
      const id = await rawPost(c, author.userId, "like me");
      await setPostLike(author, id, true, c); // own post: no notification
      for (let i = 0; i < 3; i++) {
        await setPostLike(fan, id, true, c);
        await setPostLike(fan, id, false, c);
      }
      const n = await listNotifications(author, {}, c);
      expect(n.items.map((x) => x.text)).toEqual(["Kasun Fernando appreciated your post"]);
      expect(n.items[0].href).toBe(`/community/posts/${id}`);
      expect(n.unread).toBe(1);
    }));

  it("404s on unknown or removed posts, and is rate limited", () =>
    withRollback(async (c) => {
      const me = await member(c);
      await expect(setPostLike(me, randomUUID(), true, c)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(setPostLike(me, "nope", true, c)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(setPostLike(null, randomUUID(), true, c)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      await saturate(c, "like", me.userId);
      await expect(setPostLike(me, randomUUID(), true, c)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    }));
});

/* ======================================================================== */
describe("comments", () => {
  it("adds comments and replies, keeps the count, and orders oldest first", () =>
    withRollback(async (c) => {
      const author = await member(c);
      const a = await member(c);
      const b = await member(c);
      const post = await rawPost(c, author.userId, "talk");
      const top = (await addComment(a, { postId: post, text: "  first  " }, c)).comment;
      const reply = (await addComment(b, { postId: post, parentId: top.id, text: "reply" }, c)).comment;
      await c.query("update public.comments set created_at = now() - interval '5 minutes' where id = $1", [top.id]);
      expect(top).toMatchObject({ text: "first", postId: post, authorId: a.userId, baseLikes: 0, likedByMe: false });
      expect(top.parentId).toBeUndefined();
      expect(reply.parentId).toBe(top.id);

      const { comments, members } = await listComments(author, post, c);
      expect(comments.map((x) => x.text)).toEqual(["first", "reply"]);
      expect(members.map((m) => m.id).sort()).toEqual([a.userId, b.userId].sort());
      expect((await getPost(author, post, c, store())).post.commentCount).toBe(2);
    }));

  it("validates text and targets", () =>
    withRollback(async (c) => {
      const me = await member(c);
      const post = await rawPost(c, me.userId, "p");
      const other = await rawPost(c, me.userId, "other");
      const top = (await addComment(me, { postId: post, text: "top" }, c)).comment;
      const nested = (await addComment(me, { postId: post, parentId: top.id, text: "reply" }, c)).comment;
      await expect(addComment(me, { postId: post, text: "   " }, c)).rejects.toMatchObject({ name: "ZodError" });
      await expect(addComment(me, { postId: post, text: "x".repeat(501) }, c)).rejects.toMatchObject({ name: "ZodError" });
      await expect(addComment(me, { postId: randomUUID(), text: "x" }, c)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(addComment(me, { postId: other, parentId: top.id, text: "wrong post" }, c)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(addComment(me, { postId: post, parentId: randomUUID(), text: "ghost parent" }, c)).rejects.toMatchObject({ code: "NOT_FOUND" });
      // replies are one level deep: a clean error from the service (the database enforces it too)
      await expect(addComment(me, { postId: post, parentId: nested.id, text: "too deep" }, c)).rejects.toMatchObject({ code: "VALIDATION" });
    }));

  it("notifies the post author of a comment and the comment author of a reply, once each", () =>
    withRollback(async (c) => {
      const author = await member(c, { name: "Post Author" });
      const commenter = await member(c, { name: "Commenter" });
      const replier = await member(c, { name: "Replier" });
      const post = await rawPost(c, author.userId, "p");
      const top = (await addComment(commenter, { postId: post, text: "nice" }, c)).comment;
      await addComment(replier, { postId: post, parentId: top.id, text: "agreed" }, c);
      await addComment(author, { postId: post, parentId: top.id, text: "thanks both" }, c); // author replying: only the commenter is told

      const a = await listNotifications(author, {}, c);
      // the post author hears about the top-level comment AND the other person's reply on their post
      expect(a.items.map((n) => n.text).sort()).toEqual(["Commenter commented on your post", "Replier commented on your post"]);
      const co = await listNotifications(commenter, {}, c);
      expect(co.items.map((n) => n.text).sort()).toEqual(["Post Author replied to your comment", "Replier replied to your comment"]);
      expect((await listNotifications(replier, {}, c)).items).toEqual([]);
    }));

  it("never notifies you about your own activity, or the author twice when they are both post and comment author", () =>
    withRollback(async (c) => {
      const me = await member(c);
      const other = await member(c, { name: "Other" });
      const post = await rawPost(c, me.userId, "mine");
      const mine = (await addComment(me, { postId: post, text: "note to self" }, c)).comment;
      expect((await listNotifications(me, {}, c)).items).toEqual([]);
      await addComment(other, { postId: post, parentId: mine.id, text: "reply" }, c);
      // me is both post author and parent author: exactly ONE notification
      expect((await listNotifications(me, {}, c)).items.map((n) => n.text)).toEqual(["Other replied to your comment"]);
    }));

  it("is rate limited and members-only", () =>
    withRollback(async (c) => {
      const me = await member(c);
      const post = await rawPost(c, me.userId, "p");
      await expect(addComment(null, { postId: post, text: "x" }, c)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      const banned = await member(c, { status: "suspended" });
      await expect(addComment(banned, { postId: post, text: "x" }, c)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await saturate(c, "comment", me.userId);
      await expect(addComment(me, { postId: post, text: "x" }, c)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    }));

  it("edit: author only; delete: author only, replies go with it and the count follows", () =>
    withRollback(async (c) => {
      const me = await member(c);
      const other = await member(c);
      const post = await rawPost(c, me.userId, "p");
      const top = (await addComment(me, { postId: post, text: "orig" }, c)).comment;
      const reply = (await addComment(other, { postId: post, parentId: top.id, text: "r" }, c)).comment;

      await expect(editComment(other, top.id, { text: "hijack" }, c)).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await editComment(me, top.id, { text: "  updated " }, c)).toEqual({ text: "updated" });
      expect((await listComments(me, post, c)).comments.find((x) => x.id === top.id)).toMatchObject({ text: "updated", edited: true });
      await expect(editComment(me, top.id, { text: "" }, c)).rejects.toMatchObject({ name: "ZodError" });

      await expect(deleteComment(other, top.id, c)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await deleteComment(me, top.id, c);
      const left = (await listComments(me, post, c)).comments;
      expect(left.find((x) => x.id === reply.id)).toBeUndefined();
      expect((await getPost(me, post, c, store())).post.commentCount).toBe(0);
      await expect(deleteComment(me, top.id, c)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }));

  it("comment likes: idempotent, counted, notify once", () =>
    withRollback(async (c) => {
      const author = await member(c);
      const fan = await member(c, { name: "Fan" });
      const post = await rawPost(c, author.userId, "p");
      const cm = (await addComment(author, { postId: post, text: "like me" }, c)).comment;
      expect(await setCommentLike(fan, cm.id, true, c)).toEqual({ liked: true, likeCount: 1 });
      expect(await setCommentLike(fan, cm.id, true, c)).toEqual({ liked: true, likeCount: 1 });
      const listed = (await listComments(fan, post, c)).comments[0];
      expect(listed).toMatchObject({ likedByMe: true, baseLikes: 0 });
      expect(await setCommentLike(fan, cm.id, false, c)).toEqual({ liked: false, likeCount: 0 });
      expect((await listNotifications(author, {}, c)).items.map((n) => n.text)).toEqual(["Fan appreciated your comment"]);
      await expect(setCommentLike(fan, randomUUID(), true, c)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }));

  it("listComments 404s for unknown posts and requires a member", () =>
    withRollback(async (c) => {
      const me = await member(c);
      await expect(listComments(me, randomUUID(), c)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(listComments(me, "nope", c)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(listComments(null, randomUUID(), c)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    }));
});

/* ======================================================================== */
describe("reports", () => {
  it("records a post report, once per person, and not on your own content", () =>
    withRollback(async (c) => {
      const author = await member(c);
      const me = await member(c);
      const post = await rawPost(c, author.userId, "questionable");
      await reportPost(me, post, { reason: "spam", note: "  looks like an ad  " }, c);
      const row = (await c.query("select reason, note, status, reporter_id from public.reports where post_id = $1", [post])).rows[0];
      expect(row).toMatchObject({ reason: "spam", note: "looks like an ad", status: "open", reporter_id: me.userId });

      await c.query("savepoint s");
      await expect(reportPost(me, post, { reason: "spam" }, c)).rejects.toMatchObject({ code: "CONFLICT" });
      await c.query("rollback to savepoint s");
      await expect(reportPost(author, post, { reason: "spam" }, c)).rejects.toMatchObject({ code: "VALIDATION" });
    }));

  it("records a comment report", () =>
    withRollback(async (c) => {
      const author = await member(c);
      const me = await member(c);
      const post = await rawPost(c, author.userId, "p");
      const cm = (await addComment(author, { postId: post, text: "rude" }, c)).comment;
      await reportComment(me, cm.id, { reason: "harassment" }, c);
      expect((await c.query("select count(*)::int n from public.reports where comment_id = $1", [cm.id])).rows[0].n).toBe(1);
    }));

  it("validates the reason and the target, and requires a member", () =>
    withRollback(async (c) => {
      const me = await member(c);
      await expect(reportPost(me, randomUUID(), { reason: "spam" }, c)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(reportPost(me, "nope", { reason: "spam" }, c)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(reportPost(me, randomUUID(), { reason: "boring" }, c)).rejects.toMatchObject({ name: "ZodError" });
      await expect(reportPost(me, randomUUID(), { reason: "spam", note: "x".repeat(301) }, c)).rejects.toMatchObject({ name: "ZodError" });
      await expect(reportPost(null, randomUUID(), { reason: "spam" }, c)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    }));
});

/* ======================================================================== */
describe("notifications", () => {
  async function makeNote(c: Queryable, userId: string, text: string, minutesAgo: number, read = false) {
    const { rows } = await c.query<{ id: string }>(
      `insert into public.notifications (user_id, type, text, created_at, read_at)
       values ($1, 'system', $2, now() - ($3 || ' minutes')::interval, case when $4 then now() end) returning id`,
      [userId, text, String(minutesAgo), read],
    );
    return rows[0].id;
  }

  it("lists newest first with an unread count, only for the caller", () =>
    withRollback(async (c) => {
      const me = await member(c);
      const other = await member(c);
      await makeNote(c, me.userId, "old", 30, true);
      await makeNote(c, me.userId, "new", 5);
      await makeNote(c, other.userId, "not mine", 1);
      const n = await listNotifications(me, {}, c);
      expect(n.items.map((x) => x.text)).toEqual(["new", "old"]);
      expect(n.items.map((x) => x.read)).toEqual([false, true]);
      expect(n.unread).toBe(1);
      expect(n.items[0].ageMinutes).toBeGreaterThan(4);
      await expect(listNotifications(null, {}, c)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    }));

  it("marks some or all as read, never touching other people's", () =>
    withRollback(async (c) => {
      const me = await member(c);
      const other = await member(c);
      const a = await makeNote(c, me.userId, "a", 3);
      await makeNote(c, me.userId, "b", 2);
      const theirs = await makeNote(c, other.userId, "theirs", 1);
      expect(await markNotificationsRead(me, [a, theirs, "not-a-uuid"], c)).toEqual({ unread: 1 });
      expect((await listNotifications(other, {}, c)).unread).toBe(1); // untouched
      expect(await markNotificationsRead(me, "all", c)).toEqual({ unread: 0 });
      await expect(markNotificationsRead(me, Array.from({ length: 101 }, () => randomUUID()), c)).rejects.toMatchObject({ code: "VALIDATION" });
      await expect(markNotificationsRead(null, "all", c)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    }));

  it("doesn't notify suspended members", () =>
    withRollback(async (c) => {
      const author = await member(c);
      const fan = await member(c);
      const post = await rawPost(c, author.userId, "p");
      await c.query("update public.profiles set status = 'suspended' where id = $1", [author.userId]);
      await setPostLike(fan, post, true, c);
      expect((await c.query("select count(*)::int n from public.notifications where user_id = $1", [author.userId])).rows[0].n).toBe(0);
    }));
});
