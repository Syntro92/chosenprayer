import "server-only";
import { adminChannelListSchema, channelStatusSchema, createChannelSchema, updateChannelSchema } from "@/lib/schemas/admin";
import { uuidSchema } from "@/lib/schemas/community";
import { requireRole, type Actor } from "../auth/policy";
import { db, inTransaction, one, rows, type Queryable } from "../db";
import { AppError } from "../errors";
import { audit } from "./audit";
import { likePattern } from "./community-shared";
import { notify } from "./notifications";
import { CHANNEL_IMAGE_BUCKET } from "@/lib/channels";
import { channelImageUrl, channelImages } from "../storage";
import { fetchYoutubeChannel } from "../providers/youtube";
import { saveYoutubeData } from "./youtube";

export interface AdminChannel {
  id: string;
  handle: string;
  name: string;
  description: string;
  category: string;
  categorySlug: string;
  status: "pending" | "active" | "paused" | "archived";
  featured: boolean;
  verified: boolean;
  showBlessings: boolean;
  currency: string;
  followers: number;
  supporters: number;
  blessings: number;
  raisedCents: number;
  owner: { id: string; name: string; username: string } | null;
  createdAt: string;
  publishedAt: string | null;
}

export interface AdminChannelDetail extends AdminChannel {
  mission: string;
  about: string[];
  coverTone: string;
  coverScene: string;
  avatarPath: string | null;
  coverPath: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  donationCount: number;
  youtubeChannelId: string | null;
  youtubeSubscribers: number | null;
  youtubeSyncedAt: string | null;
}

export interface AdminPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface Row {
  id: string; handle: string; name: string; description: string; category: string; category_slug: string;
  status: AdminChannel["status"]; featured: boolean; verified: boolean; show_blessings: boolean; currency: string;
  follower_count: number; supporter_count: number; blessing_count: number; total_raised_cents: number;
  owner_id: string | null; owner_name: string | null; owner_username: string | null;
  created_at: string; published_at: string | null;
  mission?: string; about?: string[]; cover_tone?: string; cover_scene?: string; avatar_path?: string | null; cover_path?: string | null; donation_count?: number;
  youtube_channel_id?: string | null; youtube_subscribers?: string | null; youtube_synced_at?: string | null;
}

const SELECT = `
  select c.id, c.handle::text as handle, c.name, c.description, cat.name as category, c.category as category_slug,
         c.status, c.featured, c.verified, c.show_blessings, c.currency::text as currency,
         c.follower_count, c.supporter_count, c.blessing_count, c.total_raised_cents,
         c.owner_id, o.display_name as owner_name, o.username::text as owner_username,
         c.created_at::text as created_at, c.published_at::text as published_at,
         c.mission, c.about, c.cover_tone::text as cover_tone, c.cover_scene::text as cover_scene, c.avatar_path, c.cover_path,
         c.youtube_channel_id, c.youtube_subscribers::text as youtube_subscribers, c.youtube_synced_at::text as youtube_synced_at,
         (select count(*)::int from public.donations d where d.channel_id = c.id and d.status = 'succeeded') as donation_count
  from public.channels c
  join public.categories cat on cat.slug = c.category
  left join public.profiles o on o.id = c.owner_id`;

const toChannel = (r: Row): AdminChannel => ({
  id: r.id,
  handle: r.handle,
  name: r.name,
  description: r.description,
  category: r.category,
  categorySlug: r.category_slug,
  status: r.status,
  featured: r.featured,
  verified: r.verified,
  showBlessings: r.show_blessings,
  currency: r.currency,
  followers: r.follower_count,
  supporters: r.supporter_count,
  blessings: r.blessing_count,
  raisedCents: r.total_raised_cents,
  owner: r.owner_id ? { id: r.owner_id, name: r.owner_name ?? "", username: r.owner_username ?? "" } : null,
  createdAt: new Date(r.created_at).toISOString(),
  publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null,
});

const toDetail = (r: Row): AdminChannelDetail => ({
  ...toChannel(r),
  mission: r.mission ?? "",
  about: r.about ?? [],
  coverTone: r.cover_tone ?? "cream",
  coverScene: r.cover_scene ?? "horizon",
  avatarPath: r.avatar_path ?? null,
  coverPath: r.cover_path ?? null,
  avatarUrl: channelImageUrl(r.avatar_path),
  coverUrl: channelImageUrl(r.cover_path),
  donationCount: r.donation_count ?? 0,
  youtubeChannelId: r.youtube_channel_id ?? null,
  youtubeSubscribers: r.youtube_subscribers == null ? null : Number(r.youtube_subscribers),
  youtubeSyncedAt: r.youtube_synced_at ? new Date(r.youtube_synced_at).toISOString() : null,
});

/** Every referenced image must really be in the bucket (uploaded through the admin endpoint). */
async function assertImagesExist(paths: (string | null | undefined)[], conn: Queryable) {
  const list = [...new Set(paths.filter((p): p is string => !!p))];
  if (list.length === 0) return;
  const found = await rows<{ name: string }>(
    "select name from storage.objects where bucket_id = $1 and name = any($2)",
    [CHANNEL_IMAGE_BUCKET, list],
    conn,
  );
  if (found.length !== list.length) {
    throw new AppError("VALIDATION", "An image didn't finish uploading. Please upload it again.", { fields: { image: "Image not found" } });
  }
}

const notFound = () => new AppError("NOT_FOUND", "Channel not found.");

export async function listAdminChannels(actor: Actor | null, raw: unknown, conn: Queryable = db): Promise<AdminPage<AdminChannel>> {
  requireRole(actor, "admin");
  const q = adminChannelListSchema.parse(raw);
  const params: unknown[] = [];
  const where: string[] = [];
  if (q.status) {
    params.push(q.status);
    where.push(`c.status = $${params.length}`);
  }
  if (q.q) {
    params.push(likePattern(q.q));
    where.push(`(c.name ilike $${params.length} or c.handle::text ilike $${params.length})`);
  }
  const clause = where.length ? `where ${where.join(" and ")}` : "";
  const total = (await one<{ n: number }>(`select count(*)::int as n from public.channels c ${clause}`, params, conn))!.n;
  params.push(q.pageSize, (q.page - 1) * q.pageSize);
  const list = await rows<Row>(
    `${SELECT} ${clause}
     order by (c.status = 'pending') desc, c.created_at desc, c.id
     limit $${params.length - 1} offset $${params.length}`,
    params,
    conn,
  );
  return { items: list.map(toChannel), total, page: q.page, pageSize: q.pageSize };
}

export async function getAdminChannel(actor: Actor | null, rawId: string, conn: Queryable = db): Promise<AdminChannelDetail> {
  requireRole(actor, "admin");
  const id = uuidSchema.safeParse(rawId);
  if (!id.success) throw notFound();
  const r = await one<Row>(`${SELECT} where c.id = $1`, [id.data], conn);
  if (!r) throw notFound();
  return toDetail(r);
}

/** Result of a change: the channel plus the public handle(s) whose cached pages must be refreshed. */
export interface ChannelChange {
  channel: AdminChannelDetail;
  handle: string;
}

export async function createAdminChannel(actor: Actor | null, raw: unknown, conn: Queryable = db): Promise<ChannelChange> {
  const a = requireRole(actor, "admin");
  const input = createChannelSchema.parse(raw);
  // Fetch from YouTube first (network, outside the transaction); a bad ID fails before anything is saved.
  const yt = input.youtubeChannel ? await fetchYoutubeChannel(input.youtubeChannel) : null;

  return inTransaction(conn, async (c) => {
    const category = await one("select 1 as ok from public.categories where slug = $1", [input.category], c);
    if (!category) throw new AppError("VALIDATION", "Unknown category.", { fields: { category: "Unknown category" } });

    let ownerId: string | null = null;
    if (input.ownerUsername) {
      const owner = await one<{ id: string }>("select id from public.profiles where username = $1", [input.ownerUsername], c);
      if (!owner) throw new AppError("VALIDATION", "No member has that username.", { fields: { ownerUsername: "No member has that username" } });
      ownerId = owner.id;
    }

    await assertImagesExist([input.avatarPath, input.coverPath], c);

    const taken = await one("select 1 as ok from public.channels where handle = $1", [input.handle], c);
    if (taken) throw new AppError("CONFLICT", "That handle is already taken.", { fields: { handle: "That handle is already taken" } });

    const created = await one<{ id: string }>(
      `insert into public.channels
         (handle, owner_id, name, description, about, mission, category, cover_tone, cover_scene, status, featured, verified, currency, show_blessings, avatar_path, cover_path, published_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::public.channel_status, $11, $12, $13, $14, $15, $16, case when $10::text = 'active' then now() end)
       returning id`,
      [input.handle, ownerId, input.name, input.description, input.about, input.mission, input.category, input.coverTone, input.coverScene, input.status, input.featured, input.verified, input.currency, input.showBlessings, input.avatarPath ?? null, input.coverPath ?? null],
      c,
    );
    if (yt) await saveYoutubeData(c, created!.id, yt);
    await audit(c, {
      actorId: a.userId,
      action: "channel.create",
      entityType: "channel",
      entityId: created!.id,
      metadata: { handle: input.handle, status: input.status, ...(yt ? { youtube: yt.channelId } : {}) },
    });
    const detail = toDetail((await one<Row>(`${SELECT} where c.id = $1`, [created!.id], c))!);
    return { channel: detail, handle: detail.handle };
  });
}

export async function updateAdminChannel(actor: Actor | null, rawId: string, raw: unknown, conn: Queryable = db): Promise<ChannelChange> {
  const a = requireRole(actor, "admin");
  const id = uuidSchema.safeParse(rawId);
  if (!id.success) throw notFound();
  const patch = updateChannelSchema.parse(raw);

  let replaced: (string | null)[] = [];
  const result = await inTransaction(conn, async (c) => {
    const before = await one<{ handle: string; avatar_path: string | null; cover_path: string | null }>(
      "select handle::text as handle, avatar_path, cover_path from public.channels where id = $1 for update",
      [id.data],
      c,
    );
    if (!before) throw notFound();
    await assertImagesExist([patch.avatarPath, patch.coverPath], c);
    // Files no longer referenced after this save (replaced or removed), deleted once it commits.
    replaced = [
      patch.avatarPath !== undefined && patch.avatarPath !== before.avatar_path ? before.avatar_path : null,
      patch.coverPath !== undefined && patch.coverPath !== before.cover_path ? before.cover_path : null,
    ];
    if (patch.category) {
      const ok = await one("select 1 as ok from public.categories where slug = $1", [patch.category], c);
      if (!ok) throw new AppError("VALIDATION", "Unknown category.", { fields: { category: "Unknown category" } });
    }

    const columns: Record<string, unknown> = {
      name: patch.name,
      description: patch.description,
      mission: patch.mission,
      about: patch.about,
      category: patch.category,
      cover_tone: patch.coverTone,
      cover_scene: patch.coverScene,
      avatar_path: patch.avatarPath,
      cover_path: patch.coverPath,
      featured: patch.featured,
      verified: patch.verified,
      show_blessings: patch.showBlessings,
    };
    const sets: string[] = [];
    const params: unknown[] = [id.data];
    for (const [col, value] of Object.entries(columns)) {
      if (value === undefined) continue;
      params.push(value);
      sets.push(`${col} = $${params.length}`);
    }
    await c.query(`update public.channels set ${sets.join(", ")} where id = $1`, params);
    await audit(c, {
      actorId: a.userId,
      action: "channel.update",
      entityType: "channel",
      entityId: id.data,
      metadata: { handle: before.handle, fields: Object.keys(patch) },
    });
    return { channel: toDetail((await one<Row>(`${SELECT} where c.id = $1`, [id.data], c))!), handle: before.handle };
  });
  await channelImages.remove(replaced);
  return result;
}

/**
 * Approve / pause / archive. Going live for the first time stamps `published_at` and tells the
 * owner. Reviewing a pending channel is the "approval" step of the create-channel flow.
 */
export async function setChannelStatus(actor: Actor | null, rawId: string, raw: unknown, conn: Queryable = db): Promise<ChannelChange> {
  const a = requireRole(actor, "admin");
  const id = uuidSchema.safeParse(rawId);
  if (!id.success) throw notFound();
  const { status, note } = channelStatusSchema.parse(raw);

  return inTransaction(conn, async (c) => {
    const ch = await one<{ handle: string; name: string; status: string; owner_id: string | null }>(
      "select handle::text as handle, name, status::text as status, owner_id from public.channels where id = $1 for update",
      [id.data],
      c,
    );
    if (!ch) throw notFound();
    if (ch.status === status) throw new AppError("CONFLICT", `That channel is already ${status}.`);
    if (status === "pending") throw new AppError("VALIDATION", "A channel can't go back to pending.");

    await c.query(
      "update public.channels set status = $2::public.channel_status, published_at = case when $2::text = 'active' then coalesce(published_at, now()) else published_at end where id = $1",
      [id.data, status],
    );
    await audit(c, {
      actorId: a.userId,
      action: "channel.status",
      entityType: "channel",
      entityId: id.data,
      metadata: { handle: ch.handle, from: ch.status, to: status, ...(note ? { note } : {}) },
    });

    if (ch.owner_id) {
      const text =
        ch.status === "pending" && status === "active"
          ? `Your channel ${ch.name} was approved and is now live.`
          : status === "active"
            ? `Your channel ${ch.name} is live again.`
            : status === "paused"
              ? `Your channel ${ch.name} was paused.${note ? ` ${note}` : ""}`
              : `Your channel ${ch.name} was archived.${note ? ` ${note}` : ""}`;
      await notify(c, { userId: ch.owner_id, actorId: a.userId, type: "system", text, href: `/channels/${ch.handle}` });
    }
    return { channel: toDetail((await one<Row>(`${SELECT} where c.id = $1`, [id.data], c))!), handle: ch.handle };
  });
}
