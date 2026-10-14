import "server-only";
import { youtubeChannelSchema, youtubeSyncSchema } from "@/lib/schemas/admin";
import { uuidSchema } from "@/lib/schemas/community";
import { requireRole, type Actor } from "../auth/policy";
import { db, inTransaction, one, rows, type Queryable } from "../db";
import { AppError } from "../errors";
import { log, errorFields } from "../logger";
import { fetchYoutubeChannel, type YoutubeChannel } from "../providers/youtube";
import { audit } from "./audit";

/** What the admin sees before saving: the channel card and its recent uploads. Nothing is stored. */
export interface YoutubePreview {
  channelId: string;
  title: string;
  description: string;
  handle: string | null;
  thumbnailUrl: string | null;
  subscribers: number | null;
  videoCount: number;
  videos: { videoId: string; title: string; publishedAt: string; thumbnailUrl: string | null }[];
}

const toPreview = (c: YoutubeChannel): YoutubePreview => ({
  channelId: c.channelId,
  title: c.title,
  description: c.description,
  handle: c.handle,
  thumbnailUrl: c.thumbnailUrl,
  subscribers: c.subscribers,
  videoCount: c.videoCount,
  videos: c.videos.map(({ videoId, title, publishedAt, thumbnailUrl }) => ({ videoId, title, publishedAt, thumbnailUrl })),
});

export async function lookupYoutubeChannel(actor: Actor | null, raw: unknown): Promise<YoutubePreview> {
  requireRole(actor, "admin");
  const { channel } = youtubeChannelSchema.parse(raw);
  return toPreview(await fetchYoutubeChannel(channel));
}

/**
 * Writes already-fetched YouTube data onto a channel: the id, subscriber count and sync time on the
 * channel row, and each video as a published `video` post (updated in place on later syncs).
 * Takes the data as an argument so no network call ever runs inside the caller's transaction.
 */
export async function saveYoutubeData(conn: Queryable, channelId: string, yt: YoutubeChannel): Promise<void> {
  const taken = await one<{ id: string }>("select id from public.channels where youtube_channel_id = $1 and id <> $2", [yt.channelId, channelId], conn);
  if (taken) throw new AppError("CONFLICT", "That YouTube channel is already linked to another channel.", { fields: { youtubeChannel: "Already linked to another channel" } });

  await conn.query("update public.channels set youtube_channel_id = $2, youtube_subscribers = $3, youtube_synced_at = now() where id = $1", [channelId, yt.channelId, yt.subscribers]);

  for (const v of yt.videos) {
    await conn.query(
      `insert into public.channel_content (channel_id, kind, title, excerpt, youtube_id, published_at)
       values ($1, 'video', $2, $3, $4, $5)
       on conflict (channel_id, youtube_id) where youtube_id is not null
       do update set title = excluded.title, excerpt = excluded.excerpt, published_at = excluded.published_at`,
      [channelId, v.title.trim().slice(0, 140) || "Untitled video", v.description.trim().slice(0, 300), v.videoId, v.publishedAt],
    );
  }
}

export interface YoutubeSyncResult {
  channelId: string;
  handle: string;
  subscribers: number | null;
  videos: number;
  syncedAt: string;
}

/** Link (when `youtubeChannel` is given) or refresh a channel's YouTube data. Used by the admin button. */
export async function syncAdminChannelYoutube(actor: Actor | null, rawId: string, raw: unknown, conn: Queryable = db): Promise<YoutubeSyncResult> {
  const a = requireRole(actor, "admin");
  const id = uuidSchema.safeParse(rawId);
  if (!id.success) throw new AppError("NOT_FOUND", "Channel not found.");
  const { youtubeChannel } = youtubeSyncSchema.parse(raw);

  const ch = await one<{ handle: string; youtube_channel_id: string | null }>("select handle::text as handle, youtube_channel_id from public.channels where id = $1", [id.data], conn);
  if (!ch) throw new AppError("NOT_FOUND", "Channel not found.");
  const target = youtubeChannel ?? ch.youtube_channel_id;
  if (!target) throw new AppError("VALIDATION", "Enter a YouTube channel ID to link.", { fields: { youtubeChannel: "Required" } });

  const yt = await fetchYoutubeChannel(target); // network first, outside any transaction
  const syncedAt = await inTransaction(conn, async (c) => {
    await saveYoutubeData(c, id.data, yt);
    await audit(c, { actorId: a.userId, action: "channel.update", entityType: "channel", entityId: id.data, metadata: { handle: ch.handle, youtube: yt.channelId } });
    return (await one<{ at: string }>("select youtube_synced_at::text as at from public.channels where id = $1", [id.data], c))!.at;
  });
  return { channelId: yt.channelId, handle: ch.handle, subscribers: yt.subscribers, videos: yt.videos.length, syncedAt: new Date(syncedAt).toISOString() };
}

/**
 * Daily cron: refresh every live linked channel. One channel failing (deleted on YouTube, quota)
 * never stops the rest. Returns the handles whose public pages need a cache refresh.
 */
export async function syncAllYoutube(conn: Queryable = db): Promise<{ synced: string[]; failed: number }> {
  const list = await rows<{ id: string; handle: string; youtube_channel_id: string }>(
    "select id, handle::text as handle, youtube_channel_id from public.channels where youtube_channel_id is not null and status = 'active' order by youtube_synced_at nulls first",
    [],
    conn,
  );
  const synced: string[] = [];
  let failed = 0;
  for (const ch of list) {
    try {
      const yt = await fetchYoutubeChannel(ch.youtube_channel_id);
      await inTransaction(conn, (c) => saveYoutubeData(c, ch.id, yt));
      synced.push(ch.handle);
    } catch (e) {
      failed++;
      log.warn("youtube sync failed", { handle: ch.handle, ...errorFields(e) });
      // A quota/key problem will fail every remaining channel the same way: stop early.
      if (e instanceof AppError && e.code === "UNAVAILABLE") break;
    }
  }
  return { synced, failed };
}
