import "server-only";
import { channelContentFeaturedSchema } from "@/lib/schemas/admin";
import { uuidSchema } from "@/lib/schemas/community";
import { requireRole, type Actor } from "../auth/policy";
import { db, inTransaction, one, rows, type Queryable } from "../db";
import { AppError } from "../errors";
import { audit } from "./audit";

export interface AdminChannelContentItem {
  id: string;
  kind: "reflection" | "video" | "message" | "story";
  title: string;
  date: string; // ISO
  youtubeId: string | null;
  facebookId: string | null;
  /** 1-3 when pinned into a "Latest from" slot; null when left to the automatic "most recent" fallback. */
  featuredPosition: number | null;
}

interface Row {
  id: string;
  kind: AdminChannelContentItem["kind"];
  title: string;
  date: string;
  youtube_id: string | null;
  facebook_id: string | null;
  featured_position: number | null;
}

const toItem = (r: Row): AdminChannelContentItem => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  date: new Date(r.date).toISOString(),
  youtubeId: r.youtube_id,
  facebookId: r.facebook_id,
  featuredPosition: r.featured_position,
});

const notFound = () => new AppError("NOT_FOUND", "Channel not found.");

async function fetchContent(channelId: string, conn: Queryable): Promise<AdminChannelContentItem[]> {
  const list = await rows<Row>(
    `select id, kind, title, published_at::text as date, youtube_id, facebook_id, featured_position
     from public.channel_content
     where channel_id = $1 and published_at is not null
     order by (featured_position is null), featured_position, published_at desc
     limit 50`,
    [channelId],
    conn,
  );
  return list.map(toItem);
}

/** Every synced video/post for a channel (most recent first), so the admin can choose which 3 feature. */
export async function listAdminChannelContent(actor: Actor | null, rawChannelId: string, conn: Queryable = db): Promise<AdminChannelContentItem[]> {
  requireRole(actor, "admin");
  const id = uuidSchema.safeParse(rawChannelId);
  if (!id.success) throw notFound();
  const channel = await one<{ id: string }>("select id from public.channels where id = $1", [id.data], conn);
  if (!channel) throw notFound();
  return fetchContent(id.data, conn);
}

/**
 * Choose which synced items fill the 3 "Latest from" slots on the public page, and in what order.
 * Clearing every other item's position first means two items can never collide on the unique index.
 */
export async function setChannelContentFeatured(
  actor: Actor | null,
  rawChannelId: string,
  raw: unknown,
  conn: Queryable = db,
): Promise<{ items: AdminChannelContentItem[]; handle: string }> {
  const a = requireRole(actor, "admin");
  const id = uuidSchema.safeParse(rawChannelId);
  if (!id.success) throw notFound();
  const { featured } = channelContentFeaturedSchema.parse(raw);
  const ids = featured.filter((v): v is string => v !== null);
  if (new Set(ids).size !== ids.length) throw new AppError("VALIDATION", "Each video or post can only fill one slot.");

  return inTransaction(conn, async (c) => {
    const channel = await one<{ handle: string }>("select handle::text as handle from public.channels where id = $1 for update", [id.data], c);
    if (!channel) throw notFound();
    if (ids.length) {
      const found = await rows<{ id: string }>("select id from public.channel_content where channel_id = $1 and id = any($2::uuid[])", [id.data, ids], c);
      if (found.length !== ids.length) throw new AppError("VALIDATION", "That video or post no longer exists.");
    }
    await c.query("update public.channel_content set featured_position = null where channel_id = $1 and featured_position is not null", [id.data]);
    for (let i = 0; i < featured.length; i++) {
      const contentId = featured[i];
      if (contentId) await c.query("update public.channel_content set featured_position = $3 where id = $1 and channel_id = $2", [contentId, id.data, i + 1]);
    }
    await audit(c, { actorId: a.userId, action: "channel.update", entityType: "channel", entityId: id.data, metadata: { handle: channel.handle, featuredContent: featured } });
    return { items: await fetchContent(id.data, c), handle: channel.handle };
  });
}
