import "server-only";
import {
  createPostSchema,
  editPostSchema,
  feedQuerySchema,
  pageQuerySchema,
  uuidSchema,
  type FeedQueryInput,
} from "@/lib/schemas/community";
import { usernameField } from "@/lib/schemas/accounts";
import type { FeedPage, Member, PostDTO } from "@/lib/community/types";
import { requireMember, type Actor } from "../auth/policy";
import { db, inTransaction, one, rows, type Queryable } from "../db";
import { AppError } from "../errors";
import { clampLimit, decodeCursor, encodeCursor, type Cursor } from "../pagination";
import { enforceRateLimit } from "../rate-limit";
import { storage as realStorage, type Storage } from "../storage";
import { attachmentsByPost, verifyUploads } from "./attachments";
import {
  ISO_US,
  MEMBER_COLUMNS,
  PG_BAD_INPUT,
  UUID_RE,
  collectMembers,
  likePattern,
  toMember,
  type MemberRow,
} from "./community-shared";
import { notify } from "./notifications";

interface PostRow extends MemberRow {
  id: string;
  body: string;
  edited: boolean;
  like_count: number;
  comment_count: number;
  age_minutes: number;
  created_raw: string;
  liked_by_me: boolean;
  pinned: boolean;
  /** Only present on feed queries (used for the popularity cursor). */
  score?: number;
}

const POST_COLUMNS = `
  p.id, p.body, p.edited_at is not null as edited, p.pinned_at is not null as pinned, p.like_count, p.comment_count,
  extract(epoch from (now() - p.created_at)) / 60 as age_minutes,
  to_char(p.created_at at time zone 'UTC', ${ISO_US}) as created_raw,
  exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = $1) as liked_by_me,
  ${MEMBER_COLUMNS}`;

const POST_FROM = `from public.posts p join public.profiles pr on pr.id = p.author_id`;

const SCORE = "(p.like_count + p.comment_count * 2)";

async function hydrate(postRows: PostRow[], conn: Queryable, store: Storage): Promise<{ posts: PostDTO[]; members: Member[] }> {
  const atts = await attachmentsByPost(postRows.map((r) => r.id), conn, store);
  const posts: PostDTO[] = postRows.map((r) => ({
    id: r.id,
    authorId: r.author_id,
    text: r.body,
    attachments: atts.get(r.id) ?? [],
    ageMinutes: Number(r.age_minutes),
    baseLikes: r.like_count - (r.liked_by_me ? 1 : 0),
    commentCount: r.comment_count,
    likedByMe: r.liked_by_me,
    ...(r.edited ? { edited: true } : {}),
    ...(r.pinned ? { pinned: true } : {}),
  }));
  return { posts, members: collectMembers(postRows) };
}

/** Checks a feed cursor's shape for the chosen filter, without touching the database. */
function validateFeedCursor(filter: "latest" | "popular" | "media", cursor: Cursor | null) {
  if (!cursor) return;
  const bad = () => new AppError("VALIDATION", "Invalid cursor.", { fields: { cursor: "Invalid cursor" } });
  if (!UUID_RE.test(cursor.id) || typeof cursor.k !== "string" || cursor.k.length > 100) throw bad();
  if (filter === "popular") {
    const [score, ts] = cursor.k.split("|");
    if (!/^\d{1,9}$/.test(score ?? "") || !ts || Number.isNaN(Date.parse(ts))) throw bad();
  } else if (Number.isNaN(Date.parse(cursor.k))) {
    throw bad();
  }
}

/* ------------------------------------------------------------------------ */
/* Reading                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * The community feed for a signed-in member: tabs (everyone / mine), filters
 * (latest / popular / has attachments), text search, and keyset pagination.
 */
export async function listFeed(
  actor: Actor | null,
  raw: FeedQueryInput = {},
  conn: Queryable = db,
  store: Storage = realStorage,
): Promise<FeedPage> {
  const a = requireMember(actor);
  const q = feedQuerySchema.parse(raw);
  const limit = clampLimit(q.limit, 10, 30);
  const cursor = decodeCursor(q.cursor);
  validateFeedCursor(q.filter, cursor);

  const params: unknown[] = [a.userId];
  const ph = (v: unknown) => (params.push(v), `$${params.length}`);

  const where = ["p.status = 'visible'"];
  // The plain "everyone, latest" feed shows pinned posts first (on page one only), so they
  // are left out of the paged query below to avoid showing them twice.
  const pinMode = q.tab === "feed" && q.filter === "latest" && !q.q;
  if (pinMode) where.push("p.pinned_at is null");
  if (q.tab === "mine") where.push("p.author_id = $1");
  if (q.filter === "media") where.push("exists (select 1 from public.post_attachments x where x.post_id = p.id)");
  if (q.q) {
    const pat = ph(likePattern(q.q));
    where.push(
      `(p.body ilike ${pat} or pr.display_name ilike ${pat} or pr.username::text ilike ${pat}
        or exists (select 1 from public.post_attachments x where x.post_id = p.id and x.name ilike ${pat}))`,
    );
  }
  const popular = q.filter === "popular";
  if (cursor) {
    if (popular) {
      const [score, ts] = (cursor.k as string).split("|");
      where.push(`(${SCORE}, p.created_at, p.id) < (${ph(Number(score))}::int, ${ph(ts)}::timestamptz, ${ph(cursor.id)}::uuid)`);
    } else {
      where.push(`(p.created_at, p.id) < (${ph(cursor.k)}::timestamptz, ${ph(cursor.id)}::uuid)`);
    }
  }
  const order = popular ? `${SCORE} desc, p.created_at desc, p.id desc` : "p.created_at desc, p.id desc";

  let fetched: PostRow[];
  try {
    fetched = await rows<PostRow>(
      `select ${POST_COLUMNS}, ${SCORE} as score ${POST_FROM}
       where ${where.join(" and ")} order by ${order} limit ${ph(limit + 1)}`,
      params,
      conn,
    );
  } catch (e) {
    if (PG_BAD_INPUT.has((e as { code?: string }).code ?? "")) throw new AppError("VALIDATION", "Invalid cursor.", { fields: { cursor: "Invalid cursor" } });
    throw e;
  }

  const hasMore = fetched.length > limit;
  const pageRows = hasMore ? fetched.slice(0, limit) : fetched;
  const last = pageRows[pageRows.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({ k: popular ? `${last.score}|${last.created_raw}` : last.created_raw, id: last.id })
      : null;

  const pinnedRows =
    pinMode && !cursor
      ? await rows<PostRow>(
          `select ${POST_COLUMNS} ${POST_FROM} where p.status = 'visible' and p.pinned_at is not null order by p.pinned_at desc, p.id`,
          [a.userId],
          conn,
        )
      : [];

  const { posts, members } = await hydrate([...pinnedRows, ...pageRows], conn, store);
  return { posts, members, nextCursor };
}

/** One post (for the post page). NOT_FOUND if it doesn't exist or isn't visible. */
export async function getPost(
  actor: Actor | null,
  rawId: string,
  conn: Queryable = db,
  store: Storage = realStorage,
): Promise<{ post: PostDTO; members: Member[] }> {
  const a = requireMember(actor);
  const id = uuidSchema.safeParse(rawId);
  if (!id.success) throw new AppError("NOT_FOUND", "Post not found.");
  const r = await one<PostRow>(`select ${POST_COLUMNS} ${POST_FROM} where p.id = $2 and p.status = 'visible'`, [a.userId, id.data], conn);
  if (!r) throw new AppError("NOT_FOUND", "Post not found.");
  const { posts, members } = await hydrate([r], conn, store);
  return { post: posts[0], members };
}

/** A member's public profile header plus their latest posts. */
export async function listMemberPosts(
  actor: Actor | null,
  rawUsername: string,
  rawPage: unknown = {},
  conn: Queryable = db,
  store: Storage = realStorage,
): Promise<{ member: Member; memberStatus: "active" | "suspended"; memberRole: "member" | "moderator" | "admin" } & FeedPage> {
  const a = requireMember(actor);
  const username = usernameField.safeParse(rawUsername);
  if (!username.success) throw new AppError("NOT_FOUND", "Member not found.");
  // Suspended members are hidden from everyone except admins (who need to find them to unsuspend).
  const m = await one<MemberRow & { status: "active" | "suspended"; role: "member" | "moderator" | "admin" }>(
    `select ${MEMBER_COLUMNS}, pr.status, pr.role from public.profiles pr
     where pr.username = $1 and (pr.status = 'active' or $2)`,
    [username.data, a.role === "admin"],
    conn,
  );
  if (!m) throw new AppError("NOT_FOUND", "Member not found.");

  const { cursor: rawCursor, limit: rawLimit } = pageQuerySchema.parse(rawPage);
  const limit = clampLimit(rawLimit, 10, 30);
  const cursor = decodeCursor(rawCursor);
  validateFeedCursor("latest", cursor);

  const params: unknown[] = [a.userId, m.author_id];
  let after = "";
  if (cursor) {
    params.push(cursor.k, cursor.id);
    after = "and (p.created_at, p.id) < ($3::timestamptz, $4::uuid)";
  }
  params.push(limit + 1);
  const fetched = await rows<PostRow>(
    `select ${POST_COLUMNS} ${POST_FROM}
     where p.author_id = $2 and p.status = 'visible' ${after}
     order by p.created_at desc, p.id desc limit $${params.length}`,
    params,
    conn,
  );
  const hasMore = fetched.length > limit;
  const pageRows = hasMore ? fetched.slice(0, limit) : fetched;
  const lastRow = pageRows[pageRows.length - 1];
  const { posts } = await hydrate(pageRows, conn, store);
  return {
    member: toMember(m),
    memberStatus: m.status,
    memberRole: m.role,
    posts,
    members: [toMember(m)],
    nextCursor: hasMore && lastRow ? encodeCursor({ k: lastRow.created_raw, id: lastRow.id }) : null,
  };
}

/* ------------------------------------------------------------------------ */
/* Writing                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Publishes a post. Files must already be uploaded (see requestUploadUrls); each is
 * verified against storage's own record before anything is saved. A post needs text,
 * at least one attachment, or both.
 */
export async function createPost(
  actor: Actor | null,
  raw: unknown,
  conn: Queryable = db,
  store: Storage = realStorage,
): Promise<{ post: PostDTO; members: Member[] }> {
  const a = requireMember(actor);
  const input = createPostSchema.parse(raw);
  if (!input.text && input.attachments.length === 0) {
    throw new AppError("VALIDATION", "Write something or attach a file first.", { fields: { text: "Write something or attach a file" } });
  }
  await enforceRateLimit("post", a.userId, conn);

  const uploads = await verifyUploads(a.userId, input.attachments, conn);
  if (uploads.filter((u) => u.kind === "image").length > 4) {
    throw new AppError("VALIDATION", "You can attach up to 4 images to one post.", { fields: { attachments: "Too many images" } });
  }

  const postId = await inTransaction(conn, async (c) => {
    const { rows: [p] } = await c.query<{ id: string }>(
      "insert into public.posts (author_id, body) values ($1, $2) returning id",
      [a.userId, input.text],
    );
    for (const [i, u] of uploads.entries()) {
      await c.query(
        `insert into public.post_attachments (post_id, kind, name, size_bytes, mime, storage_path, alt, position)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [p.id, u.kind, u.name, u.size, u.mime, u.key, u.kind === "image" ? u.name : null, i],
      );
    }
    return p.id;
  });
  return getPost(a, postId, conn, store);
}

/** Edit your own post's text. */
export async function editPost(actor: Actor | null, rawId: string, raw: unknown, conn: Queryable = db): Promise<{ text: string }> {
  const a = requireMember(actor);
  const id = uuidSchema.safeParse(rawId);
  if (!id.success) throw new AppError("NOT_FOUND", "Post not found.");
  const { text } = editPostSchema.parse(raw);

  const post = await one<{ author_id: string; attachments: number }>(
    `select p.author_id, (select count(*)::int from public.post_attachments x where x.post_id = p.id) as attachments
     from public.posts p where p.id = $1 and p.status = 'visible'`,
    [id.data],
    conn,
  );
  if (!post) throw new AppError("NOT_FOUND", "Post not found.");
  if (post.author_id !== a.userId) throw new AppError("FORBIDDEN", "You can only edit your own posts.");
  if (!text && post.attachments === 0) {
    throw new AppError("VALIDATION", "A post needs some text.", { fields: { text: "A post needs some text" } });
  }
  await conn.query("update public.posts set body = $2 where id = $1", [id.data, text]);
  return { text };
}

/** Permanently delete your own post (comments, likes and attachments go with it). */
export async function deletePost(
  actor: Actor | null,
  rawId: string,
  conn: Queryable = db,
  store: Storage = realStorage,
): Promise<void> {
  const a = requireMember(actor);
  const id = uuidSchema.safeParse(rawId);
  if (!id.success) throw new AppError("NOT_FOUND", "Post not found.");

  const post = await one<{ author_id: string }>("select author_id from public.posts where id = $1", [id.data], conn);
  if (!post) throw new AppError("NOT_FOUND", "Post not found.");
  if (post.author_id !== a.userId) throw new AppError("FORBIDDEN", "You can only delete your own posts.");

  const files = await rows<{ storage_path: string }>("select storage_path from public.post_attachments where post_id = $1", [id.data], conn);
  await conn.query("delete from public.posts where id = $1", [id.data]);
  await store.remove(files.map((f) => f.storage_path));
}

/**
 * Set whether the viewer appreciates (likes) a post. Idempotent by design (the UI sends
 * the state it wants), so double-clicks and retries can't drift the count.
 */
export async function setPostLike(
  actor: Actor | null,
  rawId: string,
  liked: boolean,
  conn: Queryable = db,
): Promise<{ liked: boolean; likeCount: number }> {
  const a = requireMember(actor);
  const id = uuidSchema.safeParse(rawId);
  if (!id.success) throw new AppError("NOT_FOUND", "Post not found.");
  await enforceRateLimit("like", a.userId, conn);

  return inTransaction(conn, async (c) => {
    const post = await one<{ author_id: string }>("select author_id from public.posts where id = $1 and status = 'visible'", [id.data], c);
    if (!post) throw new AppError("NOT_FOUND", "Post not found.");

    if (liked) {
      const ins = await c.query(
        "insert into public.post_likes (post_id, user_id) values ($1, $2) on conflict do nothing",
        [id.data, a.userId],
      );
      if (ins.rowCount) {
        await notify(c, {
          userId: post.author_id,
          actorId: a.userId,
          type: "like",
          text: `${a.displayName} appreciated your post`,
          href: `/community/posts/${id.data}`,
        });
      }
    } else {
      await c.query("delete from public.post_likes where post_id = $1 and user_id = $2", [id.data, a.userId]);
    }
    const count = await one<{ like_count: number }>("select like_count from public.posts where id = $1", [id.data], c);
    return { liked, likeCount: count?.like_count ?? 0 };
  });
}

/** The signed-in member as the UI's Member shape (avatar colour, join date, ...). */
export async function getViewer(actor: Actor | null, conn: Queryable = db): Promise<Member> {
  const a = requireMember(actor);
  const m = await one<MemberRow>(`select ${MEMBER_COLUMNS} from public.profiles pr where pr.id = $1`, [a.userId], conn);
  if (!m) throw new AppError("NOT_FOUND", "Profile not found.");
  return toMember(m);
}
