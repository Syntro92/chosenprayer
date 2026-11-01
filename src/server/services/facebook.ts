import "server-only";
import { facebookPageSchema, facebookSyncSchema } from "@/lib/schemas/admin";
import { uuidSchema } from "@/lib/schemas/community";
import { requireRole, type Actor } from "../auth/policy";
import { db, inTransaction, one, rows, type Queryable } from "../db";
import { AppError } from "../errors";
import { log, errorFields } from "../logger";
import { fetchFacebookPage, type FacebookPage } from "../providers/facebook";
import { audit } from "./audit";

/** What the admin sees before saving: the page card and its recent posts. Nothing is stored. */
export interface FacebookPreview {
  pageId: string;
  title: string;
  description: string;
  username: string | null;
  thumbnailUrl: string | null;
  followers: number | null;
  postCount: number;
  posts: { postId: string; message: string; createdAt: string; thumbnailUrl: string | null }[];
}

const toPreview = (p: FacebookPage): FacebookPreview => ({
  pageId: p.pageId,
  title: p.title,
  description: p.description,
  username: p.username,
  thumbnailUrl: p.thumbnailUrl,
  followers: p.followers,
  postCount: p.posts.length,
  posts: p.posts.map(({ postId, message, createdAt, thumbnailUrl }) => ({ postId, message, createdAt, thumbnailUrl })),
});

export async function lookupFacebookPage(actor: Actor | null, raw: unknown): Promise<FacebookPreview> {
  requireRole(actor, "admin");
  const { page } = facebookPageSchema.parse(raw);
  return toPreview(await fetchFacebookPage(page));
}

/**
 * Writes already-fetched Facebook data onto a channel: the page id, follower count and sync time on
 * the channel row, and each post as a published `story` post (updated in place on later syncs).
 * Takes the data as an argument so no network call ever runs inside the caller's transaction.
 */
export async function saveFacebookData(conn: Queryable, channelId: string, fb: FacebookPage): Promise<void> {
  const taken = await one<{ id: string }>("select id from public.channels where facebook_page_id = $1 and id <> $2", [fb.pageId, channelId], conn);
  if (taken) throw new AppError("CONFLICT", "That Facebook Page is already linked to another channel.", { fields: { facebookPage: "Already linked to another channel" } });

  await conn.query("update public.channels set facebook_page_id = $2, facebook_followers = $3, facebook_synced_at = now() where id = $1", [channelId, fb.pageId, fb.followers]);

  for (const p of fb.posts) {
    const message = p.message.trim();
    const title = (message.split("\n")[0] || "Facebook update").slice(0, 140);
    await conn.query(
      `insert into public.channel_content (channel_id, kind, title, excerpt, facebook_id, facebook_image_url, facebook_permalink_url, published_at)
       values ($1, 'story', $2, $3, $4, $5, $6, $7)
       on conflict (channel_id, facebook_id) where facebook_id is not null
       do update set title = excluded.title, excerpt = excluded.excerpt, facebook_image_url = excluded.facebook_image_url,
                      facebook_permalink_url = excluded.facebook_permalink_url, published_at = excluded.published_at`,
      [channelId, title, message.slice(0, 300), p.postId, p.thumbnailUrl, p.permalinkUrl, p.createdAt],
    );
  }
}

export interface FacebookSyncResult {
  pageId: string;
  handle: string;
  followers: number | null;
  posts: number;
  syncedAt: string;
}

/** Link (when `facebookPage` is given) or refresh a channel's Facebook data. Used by the admin button. */
export async function syncAdminChannelFacebook(actor: Actor | null, rawId: string, raw: unknown, conn: Queryable = db): Promise<FacebookSyncResult> {
  const a = requireRole(actor, "admin");
  const id = uuidSchema.safeParse(rawId);
  if (!id.success) throw new AppError("NOT_FOUND", "Channel not found.");
  const { facebookPage } = facebookSyncSchema.parse(raw);

  const ch = await one<{ handle: string; facebook_page_id: string | null }>("select handle::text as handle, facebook_page_id from public.channels where id = $1", [id.data], conn);
  if (!ch) throw new AppError("NOT_FOUND", "Channel not found.");
  const target = facebookPage ?? ch.facebook_page_id;
  if (!target) throw new AppError("VALIDATION", "Enter a Facebook Page ID to link.", { fields: { facebookPage: "Required" } });

  const fb = await fetchFacebookPage(target); // network first, outside any transaction
  const syncedAt = await inTransaction(conn, async (c) => {
    await saveFacebookData(c, id.data, fb);
    await audit(c, { actorId: a.userId, action: "channel.update", entityType: "channel", entityId: id.data, metadata: { handle: ch.handle, facebook: fb.pageId } });
    return (await one<{ at: string }>("select facebook_synced_at::text as at from public.channels where id = $1", [id.data], c))!.at;
  });
  return { pageId: fb.pageId, handle: ch.handle, followers: fb.followers, posts: fb.posts.length, syncedAt: new Date(syncedAt).toISOString() };
}

/**
 * Daily cron: refresh every live linked page. One page failing (deleted, token revoked, quota)
 * never stops the rest. Returns the handles whose public pages need a cache refresh.
 */
export async function syncAllFacebook(conn: Queryable = db): Promise<{ synced: string[]; failed: number }> {
  const list = await rows<{ id: string; handle: string; facebook_page_id: string }>(
    "select id, handle::text as handle, facebook_page_id from public.channels where facebook_page_id is not null and status = 'active' order by facebook_synced_at nulls first",
    [],
    conn,
  );
  const synced: string[] = [];
  let failed = 0;
  for (const ch of list) {
    try {
      const fb = await fetchFacebookPage(ch.facebook_page_id);
      await inTransaction(conn, (c) => saveFacebookData(c, ch.id, fb));
      synced.push(ch.handle);
    } catch (e) {
      failed++;
      log.warn("facebook sync failed", { handle: ch.handle, ...errorFields(e) });
      // A token/quota problem will fail every remaining page the same way: stop early.
      if (e instanceof AppError && e.code === "UNAVAILABLE") break;
    }
  }
  return { synced, failed };
}
