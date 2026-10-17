import "server-only";
import { handleSchema } from "@/lib/schemas/channels";
import { requireMember, type Actor } from "../auth/policy";
import { db, one, rows, type Queryable } from "../db";
import { AppError } from "../errors";
import { clampLimit, decodeCursor, toPage, type Page } from "../pagination";
import { enforceRateLimit } from "../rate-limit";
import { channelImageUrl } from "../storage";
import type { ChannelSummary } from "./channels";

export interface FollowResult {
  following: boolean;
  followerCount: number;
}

async function activeChannel(rawHandle: string, conn: Queryable): Promise<{ id: string; handle: string }> {
  const parsed = handleSchema.safeParse(rawHandle);
  if (!parsed.success) throw new AppError("NOT_FOUND", "Channel not found.");
  const ch = await one<{ id: string; handle: string }>(
    "select id, handle::text as handle from public.channels where handle = $1 and status = 'active'",
    [parsed.data],
    conn,
  );
  if (!ch) throw new AppError("NOT_FOUND", "Channel not found.");
  return ch;
}

const countOf = async (channelId: string, conn: Queryable) =>
  (await one<{ n: number }>("select follower_count as n from public.channels where id = $1", [channelId], conn))?.n ?? 0;

/** Follow a channel. Idempotent: following twice is fine and counts once. */
export async function followChannel(actor: Actor | null, handle: string, conn: Queryable = db): Promise<FollowResult> {
  const a = requireMember(actor);
  await enforceRateLimit("follow", a.userId, conn);
  const ch = await activeChannel(handle, conn);
  await conn.query(
    "insert into public.channel_follows (channel_id, user_id) values ($1, $2) on conflict do nothing",
    [ch.id, a.userId],
  );
  return { following: true, followerCount: await countOf(ch.id, conn) };
}

/** Unfollow. Idempotent as well. Works even if the channel was since paused or archived. */
export async function unfollowChannel(actor: Actor | null, handle: string, conn: Queryable = db): Promise<FollowResult> {
  const a = requireMember(actor);
  await enforceRateLimit("follow", a.userId, conn);
  const parsed = handleSchema.safeParse(handle);
  if (!parsed.success) throw new AppError("NOT_FOUND", "Channel not found.");
  const ch = await one<{ id: string }>("select id from public.channels where handle = $1", [parsed.data], conn);
  if (!ch) throw new AppError("NOT_FOUND", "Channel not found.");
  await conn.query("delete from public.channel_follows where channel_id = $1 and user_id = $2", [ch.id, a.userId]);
  return { following: false, followerCount: await countOf(ch.id, conn) };
}

/** Whether the viewer follows this channel. Visitors simply don't. */
export async function isFollowing(actor: Actor | null, handle: string, conn: Queryable = db): Promise<boolean> {
  if (!actor || actor.status !== "active") return false;
  const parsed = handleSchema.safeParse(handle);
  if (!parsed.success) return false;
  const r = await one(
    `select 1 from public.channel_follows f join public.channels c on c.id = f.channel_id
     where c.handle = $1 and f.user_id = $2`,
    [parsed.data, actor.userId],
    conn,
  );
  return r !== null;
}

/** Channels the signed-in member follows, newest follow first. */
export async function listMyFollowing(
  actor: Actor | null,
  opts: { cursor?: string; limit?: number } = {},
  conn: Queryable = db,
): Promise<Page<ChannelSummary>> {
  const a = requireMember(actor);
  const limit = clampLimit(opts.limit, 20, 50);
  const cursor = decodeCursor(opts.cursor);
  if (cursor && typeof cursor.k !== "string") throw new AppError("VALIDATION", "Invalid cursor.");

  const params: unknown[] = [a.userId];
  let after = "";
  if (cursor) {
    params.push(cursor.k, cursor.id);
    after = "and (f.created_at, f.channel_id) < ($2::timestamptz, $3::uuid)";
  }
  params.push(limit + 1);

  type Row = {
    id: string; handle: string; name: string; description: string; category: string; category_slug: string;
    follower_count: number; supporter_count: number; youtube_subscribers: string | null; created_raw: string; followed_raw: string;
    cover_tone: ChannelSummary["cover"]["tone"]; cover_scene: ChannelSummary["cover"]["scene"];
    avatar_path: string | null; cover_path: string | null; featured: boolean; verified: boolean;
  };
  let fetched: Row[];
  try {
    fetched = await rows<Row>(
      `select c.id, c.handle::text as handle, c.name, c.description, cat.name as category, cat.slug as category_slug,
              c.follower_count, c.supporter_count, c.youtube_subscribers::text as youtube_subscribers,
              to_char(c.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_raw,
              to_char(f.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as followed_raw,
              c.cover_tone, c.cover_scene, c.avatar_path, c.cover_path, c.featured, c.verified
       from public.channel_follows f
       join public.channels c on c.id = f.channel_id
       join public.categories cat on cat.slug = c.category
       where f.user_id = $1 and c.status = 'active' ${after}
       order by f.created_at desc, f.channel_id desc
       limit $${params.length}`,
      params,
      conn,
    );
  } catch (e) {
    if (["22P02", "22007"].includes((e as { code?: string }).code ?? "")) throw new AppError("VALIDATION", "Invalid cursor.");
    throw e;
  }

  const page = toPage(fetched, limit, (r) => ({ k: r.followed_raw, id: r.id }));
  return {
    nextCursor: page.nextCursor,
    items: page.items.map((r) => ({
      handle: r.handle,
      name: r.name,
      description: r.description,
      category: r.category,
      categorySlug: r.category_slug,
      followers: r.follower_count,
      supporters: r.supporter_count,
      subscribers: r.youtube_subscribers == null ? null : Number(r.youtube_subscribers),
      createdAt: new Date(r.created_raw).toISOString(),
      cover: { tone: r.cover_tone, scene: r.cover_scene },
      avatarUrl: channelImageUrl(r.avatar_path),
      coverUrl: channelImageUrl(r.cover_path),
      featured: r.featured,
      verified: r.verified,
    })),
  };
}
