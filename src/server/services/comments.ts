import "server-only";
import { addCommentSchema, editCommentSchema, uuidSchema } from "@/lib/schemas/community";
import type { CommentDTO, Member } from "@/lib/community/types";
import { requireMember, type Actor } from "../auth/policy";
import { db, inTransaction, one, rows, type Queryable } from "../db";
import { AppError } from "../errors";
import { enforceRateLimit } from "../rate-limit";
import { ISO_US, MEMBER_COLUMNS, collectMembers, type MemberRow } from "./community-shared";
import { notify } from "./notifications";

interface CommentRow extends MemberRow {
  id: string;
  post_id: string;
  parent_id: string | null;
  body: string;
  edited: boolean;
  like_count: number;
  age_minutes: number;
  created_raw: string;
  liked_by_me: boolean;
}

const COMMENT_COLUMNS = `
  c.id, c.post_id, c.parent_id, c.body, c.edited_at is not null as edited, c.like_count,
  extract(epoch from (now() - c.created_at)) / 60 as age_minutes,
  to_char(c.created_at at time zone 'UTC', ${ISO_US}) as created_raw,
  exists (select 1 from public.comment_likes l where l.comment_id = c.id and l.user_id = $1) as liked_by_me,
  ${MEMBER_COLUMNS}`;

const COMMENT_FROM = "from public.comments c join public.profiles pr on pr.id = c.author_id";

const toDto = (r: CommentRow): CommentDTO => ({
  id: r.id,
  postId: r.post_id,
  authorId: r.author_id,
  text: r.body,
  ageMinutes: Number(r.age_minutes),
  baseLikes: r.like_count - (r.liked_by_me ? 1 : 0),
  likedByMe: r.liked_by_me,
  ...(r.parent_id ? { parentId: r.parent_id } : {}),
  ...(r.edited ? { edited: true } : {}),
});

const notFound = () => new AppError("NOT_FOUND", "Comment not found.");

async function visiblePost(postId: string, conn: Queryable) {
  return one<{ author_id: string }>("select author_id from public.posts where id = $1 and status = 'visible'", [postId], conn);
}

/** Every comment on a post, oldest first (replies are linked by parentId). */
export async function listComments(
  actor: Actor | null,
  rawPostId: string,
  conn: Queryable = db,
): Promise<{ comments: CommentDTO[]; members: Member[] }> {
  const a = requireMember(actor);
  const postId = uuidSchema.safeParse(rawPostId);
  if (!postId.success || !(await visiblePost(postId.data, conn))) throw new AppError("NOT_FOUND", "Post not found.");
  const list = await rows<CommentRow>(
    `select ${COMMENT_COLUMNS} ${COMMENT_FROM}
     where c.post_id = $2 and c.status = 'visible' order by c.created_at, c.id limit 500`,
    [a.userId, postId.data],
    conn,
  );
  return { comments: list.map(toDto), members: collectMembers(list) };
}

/**
 * Add a comment, or a reply (one level deep). The post's author is notified of a
 * comment; the parent comment's author of a reply (never twice for the same event).
 */
export async function addComment(
  actor: Actor | null,
  raw: unknown,
  conn: Queryable = db,
): Promise<{ comment: CommentDTO; members: Member[] }> {
  const a = requireMember(actor);
  const input = addCommentSchema.parse(raw);
  await enforceRateLimit("comment", a.userId, conn);

  const id = await inTransaction(conn, async (c) => {
    const post = await visiblePost(input.postId, c);
    if (!post) throw new AppError("NOT_FOUND", "Post not found.");

    let parentAuthor: string | null = null;
    if (input.parentId) {
      const parent = await one<{ author_id: string; post_id: string; parent_id: string | null }>(
        "select author_id, post_id, parent_id from public.comments where id = $1 and status = 'visible'",
        [input.parentId],
        c,
      );
      if (!parent || parent.post_id !== input.postId) throw new AppError("NOT_FOUND", "The comment you're replying to no longer exists.");
      // Replies are one level deep (the database enforces this too; this gives a clean message).
      if (parent.parent_id) throw new AppError("VALIDATION", "You can't reply to a reply. Reply to the original comment instead.");
      parentAuthor = parent.author_id;
    }

    const { rows: [row] } = await c.query<{ id: string }>(
      "insert into public.comments (post_id, author_id, parent_id, body) values ($1, $2, $3, $4) returning id",
      [input.postId, a.userId, input.parentId ?? null, input.text],
    );

    const href = `/community/posts/${input.postId}`;
    if (parentAuthor) {
      await notify(c, { userId: parentAuthor, actorId: a.userId, type: "reply", text: `${a.displayName} replied to your comment`, href });
    }
    // Don't tell the post author twice if they are also the parent comment's author.
    if (post.author_id !== parentAuthor) {
      await notify(c, { userId: post.author_id, actorId: a.userId, type: "comment", text: `${a.displayName} commented on your post`, href });
    }
    return row.id;
  });

  const r = await one<CommentRow>(`select ${COMMENT_COLUMNS} ${COMMENT_FROM} where c.id = $2`, [a.userId, id], conn);
  return { comment: toDto(r!), members: collectMembers([r!]) };
}

export async function editComment(actor: Actor | null, rawId: string, raw: unknown, conn: Queryable = db): Promise<{ text: string }> {
  const a = requireMember(actor);
  const id = uuidSchema.safeParse(rawId);
  if (!id.success) throw notFound();
  const { text } = editCommentSchema.parse(raw);
  const c = await one<{ author_id: string }>("select author_id from public.comments where id = $1 and status = 'visible'", [id.data], conn);
  if (!c) throw notFound();
  if (c.author_id !== a.userId) throw new AppError("FORBIDDEN", "You can only edit your own comments.");
  await conn.query("update public.comments set body = $2 where id = $1", [id.data, text]);
  return { text };
}

/** Delete your own comment. Its replies are removed with it. */
export async function deleteComment(actor: Actor | null, rawId: string, conn: Queryable = db): Promise<void> {
  const a = requireMember(actor);
  const id = uuidSchema.safeParse(rawId);
  if (!id.success) throw notFound();
  const c = await one<{ author_id: string }>("select author_id from public.comments where id = $1", [id.data], conn);
  if (!c) throw notFound();
  if (c.author_id !== a.userId) throw new AppError("FORBIDDEN", "You can only delete your own comments.");
  await conn.query("delete from public.comments where id = $1", [id.data]);
}

export async function setCommentLike(
  actor: Actor | null,
  rawId: string,
  liked: boolean,
  conn: Queryable = db,
): Promise<{ liked: boolean; likeCount: number }> {
  const a = requireMember(actor);
  const id = uuidSchema.safeParse(rawId);
  if (!id.success) throw notFound();
  await enforceRateLimit("like", a.userId, conn);

  return inTransaction(conn, async (c) => {
    const target = await one<{ author_id: string; post_id: string }>(
      `select c.author_id, c.post_id from public.comments c join public.posts p on p.id = c.post_id
       where c.id = $1 and c.status = 'visible' and p.status = 'visible'`,
      [id.data],
      c,
    );
    if (!target) throw notFound();

    if (liked) {
      const ins = await c.query("insert into public.comment_likes (comment_id, user_id) values ($1, $2) on conflict do nothing", [id.data, a.userId]);
      if (ins.rowCount) {
        await notify(c, {
          userId: target.author_id,
          actorId: a.userId,
          type: "like",
          text: `${a.displayName} appreciated your comment`,
          href: `/community/posts/${target.post_id}`,
        });
      }
    } else {
      await c.query("delete from public.comment_likes where comment_id = $1 and user_id = $2", [id.data, a.userId]);
    }
    const count = await one<{ like_count: number }>("select like_count from public.comments where id = $1", [id.data], c);
    return { liked, likeCount: count?.like_count ?? 0 };
  });
}
