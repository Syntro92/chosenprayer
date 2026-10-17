import "server-only";
import { channelListSchema, handleSchema, type ChannelListInput } from "@/lib/schemas/channels";
import { db, one, rows, type Queryable } from "../db";
import { AppError } from "../errors";
import { readGivingSettings } from "./giving-settings";
import { clampLimit, decodeCursor, toPage, type Cursor, type Page } from "../pagination";
import { channelImageUrl } from "../storage";

/** A channel as shown on cards and in the directory. Shape matches what the UI already used. */
export interface ChannelSummary {
  handle: string;
  name: string;
  description: string;
  category: string; // display name, e.g. "Faith"
  categorySlug: string;
  followers: number;
  supporters: number;
  subscribers: number | null; // YouTube subscribers (null = not linked / hidden)
  createdAt: string; // ISO timestamp
  cover: { tone: "cream" | "mist" | "sage" | "stone"; scene: "horizon" | "hills" | "sun" | "waves" };
  avatarUrl: string | null; // uploaded profile picture
  featured: boolean;
  verified: boolean;
}

export interface ChannelContentItem {
  id: string;
  kind: "Reflection" | "Video" | "Message" | "Story";
  title: string;
  excerpt: string;
  date: string; // YYYY-MM-DD
  cover: ChannelSummary["cover"];
  youtubeId?: string;
}

export interface BlessingItem {
  id: string;
  name: string; // "Anonymous" when the supporter chose privacy
  message: string;
  date: string; // YYYY-MM-DD
  amount?: number; // whole currency units, only when the supporter opted to show it
}

export interface ChannelProfileData {
  about: string[];
  mission: string;
  links: { label: string; href: string }[];
  content: ChannelContentItem[];
  blessings: BlessingItem[];
  blessingsCount: number;
  /** False when an admin switched blessings off for this channel. */
  showBlessings: boolean;
  /** False (the default) unless an admin switched the site-wide Top Supporters list on (Admin > Channels > Support settings). */
  showTopSupporters: boolean;
  topSupporters: { name: string; total: number }[];
  /** False when an admin switched the site-wide Recent Supporters list off (Admin > Channels > Support settings). */
  showRecentSupporters: boolean;
  /** The latest succeeded gifts, newest first (empty when switched off). Names are masked like the top supporters; emails and ids never leave the service. */
  recentSupporters: RecentSupporterItem[];
  /** Pass to listRecentSupporters for the next page; null when there are no more. */
  recentNextCursor: string | null;
  givingPresets: number[];
}

/** How many supporters the public list shows. */
export const TOP_SUPPORTERS_LIMIT = 5;
/** Recent supporters per page: the first page on the channel page, then each "Load more". */
export const RECENT_SUPPORTERS_LIMIT = 6;

export interface RecentSupporterItem {
  name: string;
  amount: number;
  paidAt: string; // ISO timestamp
}

export interface Category {
  slug: string;
  name: string;
}

interface SummaryRow {
  handle: string;
  name: string;
  description: string;
  category: string;
  category_slug: string;
  follower_count: number;
  supporter_count: number;
  youtube_subscribers: string | null;
  created_raw: string;
  cover_tone: ChannelSummary["cover"]["tone"];
  cover_scene: ChannelSummary["cover"]["scene"];
  avatar_path: string | null;
  featured: boolean;
  verified: boolean;
  id: string;
  name_key: string;
}

const SUMMARY_COLUMNS = `
  c.id, c.handle::text as handle, c.name, c.description, cat.name as category, cat.slug as category_slug,
  c.follower_count, c.supporter_count, c.youtube_subscribers::text as youtube_subscribers, to_char(c.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_raw,
  c.cover_tone, c.cover_scene, c.avatar_path, c.featured, c.verified, lower(c.name) as name_key`;

const toSummary = (r: SummaryRow): ChannelSummary => ({
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
  featured: r.featured,
  verified: r.verified,
});

/** Escapes LIKE wildcards so user text is matched literally. */
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;

export async function listCategories(conn: Queryable = db): Promise<Category[]> {
  return rows<Category>("select slug, name from public.categories order by position, name", [], conn);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates a directory query completely (shape, limits, and the cursor's type for the
 * chosen sort) WITHOUT touching the database. Public callers run this before the cached
 * read, because errors thrown inside a `use cache` function lose their type.
 */
export function parseChannelQuery(raw: ChannelListInput) {
  const input = channelListSchema.parse(raw);
  const cursor = decodeCursor(input.cursor);
  if (cursor) {
    const bad = () => new AppError("VALIDATION", "Invalid cursor.", { fields: { cursor: "Invalid cursor" } });
    if (!UUID_RE.test(cursor.id)) throw bad();
    if (input.sort === "popular") {
      if (typeof cursor.k !== "number" || !Number.isInteger(cursor.k) || cursor.k < 0 || cursor.k > 2_147_483_647) throw bad();
    } else if (typeof cursor.k !== "string" || cursor.k.length > 200) {
      throw bad();
    } else if (input.sort === "newest" && Number.isNaN(Date.parse(cursor.k))) {
      throw bad();
    }
  }
  return { input, cursor };
}

/**
 * The public directory: active channels only, with search, category, size scope, sort,
 * and keyset pagination (a cursor remembers the last row, so pages never shift).
 */
export async function listChannels(raw: ChannelListInput, conn: Queryable = db): Promise<Page<ChannelSummary>> {
  const { input, cursor } = parseChannelQuery(raw);
  const limit = clampLimit(input.limit, 12, 50);

  const params: unknown[] = [];
  const ph = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  const where: string[] = ["c.status = 'active'"];
  if (input.category) where.push(`cat.slug = ${ph(input.category)}`);
  if (input.scope === "large") where.push("c.follower_count >= 10000");
  if (input.scope === "growing") where.push("c.follower_count < 10000");
  if (input.featured === "exclude") where.push("not c.featured");
  if (input.featured === "only") where.push("c.featured");
  if (input.q) {
    const p = ph(likePattern(input.q));
    where.push(`(c.name ilike ${p} or c.handle::text ilike ${p} or c.description ilike ${p} or cat.name ilike ${p})`);
  }

  // Sort key + tie-breaker id. The cursor row comparison must match the ORDER BY exactly.
  let orderBy: string;
  if (input.sort === "newest") orderBy = "c.created_at desc, c.id desc";
  else if (input.sort === "name") orderBy = "lower(c.name) asc, c.id asc";
  else orderBy = "c.follower_count desc, c.id desc";

  if (cursor) {
    // parseChannelQuery already checked the cursor's type and format for this sort.
    if (input.sort === "newest") {
      where.push(`(c.created_at, c.id) < (${ph(cursor.k)}::timestamptz, ${ph(cursor.id)}::uuid)`);
    } else if (input.sort === "name") {
      where.push(`(lower(c.name), c.id) > (${ph(cursor.k)}::text, ${ph(cursor.id)}::uuid)`);
    } else {
      where.push(`(c.follower_count, c.id) < (${ph(cursor.k)}::int, ${ph(cursor.id)}::uuid)`);
    }
  }

  let fetched: SummaryRow[];
  try {
    fetched = await rows<SummaryRow>(
      `select ${SUMMARY_COLUMNS}
       from public.channels c join public.categories cat on cat.slug = c.category
       where ${where.join(" and ")}
       order by ${orderBy}
       limit ${ph(limit + 1)}`,
      params,
      conn,
    );
  } catch (e) {
    // A hand-edited cursor can be well-formed JSON yet not a valid uuid/timestamp.
    if ((e as { code?: string }).code === "22P02" || (e as { code?: string }).code === "22007") {
      throw new AppError("VALIDATION", "Invalid cursor.", { fields: { cursor: "Invalid cursor" } });
    }
    throw e;
  }

  const cursorOf = (r: SummaryRow): Cursor => {
    if (input.sort === "newest") return { k: r.created_raw, id: r.id };
    if (input.sort === "name") return { k: r.name_key, id: r.id };
    return { k: r.follower_count, id: r.id };
  };
  const page = toPage(fetched, limit, cursorOf);
  return { items: page.items.map(toSummary), nextCursor: page.nextCursor };
}

/** The single featured channel (most followed, if several are flagged), or null. */
export async function getFeaturedChannel(conn: Queryable = db): Promise<ChannelSummary | null> {
  const r = await one<SummaryRow>(
    `select ${SUMMARY_COLUMNS}
     from public.channels c join public.categories cat on cat.slug = c.category
     where c.status = 'active' and c.featured
     order by c.follower_count desc, c.id limit 1`,
    [],
    conn,
  );
  return r ? toSummary(r) : null;
}

/**
 * One row per succeeded gift (refunds drop out), newest first, keyset-paged on (paid_at, id).
 * A name is shown only when the donor gave one and did not leave an anonymous blessing for this gift.
 */
async function recentSupporterPage(channelId: string, cursor: Cursor | null, conn: Queryable): Promise<Page<RecentSupporterItem>> {
  const params: unknown[] = [channelId];
  let after = "";
  if (cursor) {
    params.push(cursor.k, cursor.id);
    after = "and (d.paid_at, d.id) < ($2::timestamptz, $3::uuid)";
  }
  params.push(RECENT_SUPPORTERS_LIMIT + 1);
  let fetched: { id: string; name: string | null; anonymous: boolean; amount_cents: number; paid_raw: string }[];
  try {
    fetched = await rows(
      `select d.id, coalesce(p.display_name, d.donor_name) as name,
              exists (select 1 from public.blessings b where b.donation_id = d.id and b.is_anonymous) as anonymous,
              d.amount_cents::float8 as amount_cents,
              to_char(d.paid_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as paid_raw
       from public.donations d
       left join public.profiles p on p.id = d.donor_id
       where d.channel_id = $1 and d.status = 'succeeded' and d.paid_at is not null ${after}
       order by d.paid_at desc, d.id desc
       limit $${params.length}`,
      params,
      conn,
    );
  } catch (e) {
    // A hand-edited cursor can be well-formed JSON yet not a valid uuid/timestamp.
    if ((e as { code?: string }).code === "22P02" || (e as { code?: string }).code === "22007") {
      throw new AppError("VALIDATION", "Invalid cursor.", { fields: { cursor: "Invalid cursor" } });
    }
    throw e;
  }
  const page = toPage(fetched, RECENT_SUPPORTERS_LIMIT, (r) => ({ k: r.paid_raw, id: r.id }));
  return {
    nextCursor: page.nextCursor,
    items: page.items.map((r) => ({
      name: r.anonymous || !r.name ? "Anonymous" : r.name,
      amount: Math.round(r.amount_cents / 100),
      paidAt: new Date(r.paid_raw).toISOString(),
    })),
  };
}

/** "Load more" for the Recent Supporters list. Empty when the channel is not active or an admin switched the list off. */
export async function listRecentSupporters(
  rawHandle: string,
  rawCursor: string | null | undefined,
  conn: Queryable = db,
): Promise<Page<RecentSupporterItem>> {
  const parsed = handleSchema.safeParse(rawHandle);
  if (!parsed.success) throw new AppError("NOT_FOUND", "Channel not found.");
  const cursor = decodeCursor(rawCursor);
  if (cursor && (!UUID_RE.test(cursor.id) || typeof cursor.k !== "string" || Number.isNaN(Date.parse(cursor.k)))) {
    throw new AppError("VALIDATION", "Invalid cursor.", { fields: { cursor: "Invalid cursor" } });
  }
  const channel = await one<{ id: string }>("select id from public.channels where handle = $1 and status = 'active'", [parsed.data], conn);
  if (!channel) throw new AppError("NOT_FOUND", "Channel not found.");
  if (!(await readGivingSettings(conn)).showRecentSupporters) return { items: [], nextCursor: null };
  return recentSupporterPage(channel.id, cursor, conn);
}

const KIND_LABEL = { reflection: "Reflection", video: "Video", message: "Message", story: "Story" } as const;

/** Everything the public channel page needs. NOT_FOUND unless the channel is active. */
export async function getChannelProfile(
  rawHandle: string,
  conn: Queryable = db,
): Promise<{ channel: ChannelSummary; data: ChannelProfileData }> {
  const parsed = handleSchema.safeParse(rawHandle);
  if (!parsed.success) throw new AppError("NOT_FOUND", "Channel not found.");
  const handle = parsed.data;

  const base = await one<SummaryRow & { about: string[]; mission: string; blessing_count: number; show_blessings: boolean; youtube_channel_id: string | null }>(
    `select ${SUMMARY_COLUMNS}, c.about, c.mission, c.blessing_count, c.show_blessings, c.youtube_channel_id
     from public.channels c join public.categories cat on cat.slug = c.category
     where c.handle = $1 and c.status = 'active'`,
    [handle],
    conn,
  );
  if (!base) throw new AppError("NOT_FOUND", "Channel not found.");

  const links = await rows<{ label: string; href: string }>(
    "select label, href from public.channel_links where channel_id = $1 order by position, created_at",
    [base.id],
    conn,
  );
  const content = await rows<{
      id: string;
      kind: keyof typeof KIND_LABEL;
      title: string;
      excerpt: string;
      date: string;
      youtube_id: string | null;
      cover_tone: ChannelSummary["cover"]["tone"];
      cover_scene: ChannelSummary["cover"]["scene"];
  }>(
    `select id, kind, title, excerpt, to_char(published_at at time zone 'UTC', 'YYYY-MM-DD') as date,
            youtube_id, cover_tone, cover_scene
     from public.channel_content
     where channel_id = $1 and published_at is not null and published_at <= now()
     order by published_at desc limit 3`,
    [base.id],
    conn,
  );
  // The masked public view: anonymous names hidden, amount only when the supporter opted in.
  const blessings = base.show_blessings
    ? await rows<{ id: string; name: string; message: string; date: string; amount_cents: number | null }>(
        `select id, name, message, to_char(date at time zone 'UTC', 'YYYY-MM-DD') as date, amount_cents
         from public.channel_blessings_public where channel_id = $1 order by date desc limit 12`,
        [base.id],
        conn,
      )
    : [];

  // Ranked by what each person has given in succeeded donations (refunds drop out). A supporter is
  // the signed-in member, else the guest's email. Anyone without a name, or who left an anonymous
  // blessing here, is shown as "Anonymous". Emails and ids never leave this function.
  const giving = await readGivingSettings(conn);
  const supporters = giving.showTopSupporters
    ? await rows<{ name: string | null; anonymous: boolean; total_cents: number }>(
        `select coalesce((array_agg(p.display_name) filter (where p.display_name is not null))[1],
                         (array_agg(d.donor_name order by d.paid_at desc) filter (where d.donor_name is not null))[1]) as name,
                bool_or(exists (select 1 from public.blessings b where b.donation_id = d.id and b.is_anonymous)) as anonymous,
                sum(d.amount_cents)::float8 as total_cents
         from public.donations d
         left join public.profiles p on p.id = d.donor_id
         where d.channel_id = $1 and d.status = 'succeeded'
         group by coalesce(d.donor_id::text, lower(d.donor_email::text), d.id::text)
         order by total_cents desc, min(d.paid_at), coalesce(d.donor_id::text, lower(d.donor_email::text), d.id::text)
         limit $2`,
        [base.id, TOP_SUPPORTERS_LIMIT],
        conn,
      )
    : [];

  const recent = giving.showRecentSupporters
    ? await recentSupporterPage(base.id, null, conn)
    : { items: [], nextCursor: null };

  return {
    channel: toSummary(base),
    data: {
      about: base.about,
      ...(base.youtube_channel_id ? { youtubeUrl: `https://www.youtube.com/channel/${base.youtube_channel_id}` } : {}),
      mission: base.mission,
      links,
      content: content.map((c) => ({
        id: c.id,
        kind: KIND_LABEL[c.kind],
        title: c.title,
        excerpt: c.excerpt,
        date: c.date,
        cover: { tone: c.cover_tone, scene: c.cover_scene },
        ...(c.youtube_id ? { youtubeId: c.youtube_id } : {}),
      })),
      blessings: blessings.map((b) => ({
        id: b.id,
        name: b.name,
        message: b.message,
        date: b.date,
        ...(b.amount_cents != null ? { amount: b.amount_cents / 100 } : {}),
      })),
      blessingsCount: base.show_blessings ? base.blessing_count : 0,
      showBlessings: base.show_blessings,
      showTopSupporters: giving.showTopSupporters,
      givingPresets: giving.presets,
      topSupporters: supporters.map((s) => ({
        name: s.anonymous || !s.name ? "Anonymous" : s.name,
        total: Math.round(s.total_cents / 100),
      })),
      showRecentSupporters: giving.showRecentSupporters,
      recentSupporters: recent.items,
      recentNextCursor: recent.nextCursor,
    },
  };
}
