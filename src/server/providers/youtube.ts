import "server-only";
import { getEnv } from "../env";
import { AppError } from "../errors";

// YouTube Data API v3 (read-only, API key). channels.list + playlistItems.list cost 1 quota unit each
// (default quota is 10,000 units a day), so a full sync of one channel is 2 units.

const API = "https://www.googleapis.com/youtube/v3";
const CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;

export interface YoutubeVideo {
  videoId: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnailUrl: string | null;
}

export interface YoutubeChannel {
  channelId: string;
  title: string;
  description: string;
  /** "@handle" without the @, when the channel has one. */
  handle: string | null;
  thumbnailUrl: string | null;
  /** null when the owner hides the subscriber count. */
  subscribers: number | null;
  videoCount: number;
  videos: YoutubeVideo[];
}

type Ref = { by: "id"; value: string } | { by: "handle"; value: string };

/** Accepts a channel id (UC…), a youtube.com/channel/UC… link, or an @handle / youtube.com/@handle link. */
export function parseChannelRef(input: string): Ref {
  const s = input.trim();
  if (CHANNEL_ID_RE.test(s)) return { by: "id", value: s };
  const handle = /^@?([A-Za-z0-9._-]{3,30})$/.exec(s) ?? /youtube\.com\/@([A-Za-z0-9._-]{3,30})/i.exec(s);
  if (handle && (s.startsWith("@") || /youtube\.com/i.test(s))) return { by: "handle", value: handle[1] };
  const link = /youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})/i.exec(s);
  if (link) return { by: "id", value: link[1] };
  throw new AppError("VALIDATION", "Enter a YouTube channel ID (starts with UC), a channel link, or an @handle.", {
    fields: { youtubeChannel: "Not a valid YouTube channel" },
  });
}

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const key = getEnv().YOUTUBE_API_KEY;
  if (!key) throw new AppError("UNAVAILABLE", "YouTube isn't set up yet: add YOUTUBE_API_KEY to the server environment.");
  const url = `${API}/${path}?${new URLSearchParams(params)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { "x-goog-api-key": key }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new AppError("UNAVAILABLE", "Couldn't reach YouTube. Try again in a moment.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { errors?: { reason?: string }[]; message?: string } } | null;
    const reason = body?.error?.errors?.[0]?.reason;
    if (reason === "quotaExceeded" || reason === "rateLimitExceeded") throw new AppError("UNAVAILABLE", "YouTube's daily request limit was reached. Try again tomorrow.");
    // Never echo the key or Google's raw message to the browser.
    throw new AppError("UNAVAILABLE", "YouTube rejected the request. Check that YOUTUBE_API_KEY is valid and the YouTube Data API v3 is enabled.");
  }
  return (await res.json()) as T;
}

interface Thumbs {
  default?: { url: string };
  medium?: { url: string };
  high?: { url: string };
}
const thumb = (t?: Thumbs) => t?.medium?.url ?? t?.high?.url ?? t?.default?.url ?? null;

/** Channel details, subscriber count and the latest `videoLimit` public uploads. */
export async function fetchYoutubeChannel(input: string, videoLimit = 12): Promise<YoutubeChannel> {
  const ref = parseChannelRef(input);
  const list = await get<{
    items?: {
      id: string;
      snippet: { title: string; description: string; customUrl?: string; thumbnails?: Thumbs };
      statistics: { subscriberCount?: string; hiddenSubscriberCount?: boolean; videoCount?: string };
      contentDetails: { relatedPlaylists: { uploads: string } };
    }[];
  }>("channels", {
    part: "snippet,statistics,contentDetails",
    ...(ref.by === "id" ? { id: ref.value } : { forHandle: `@${ref.value}` }),
  });
  const c = list.items?.[0];
  if (!c) throw new AppError("NOT_FOUND", "No YouTube channel found for that ID.", { fields: { youtubeChannel: "No YouTube channel found" } });

  const uploads = await get<{
    items?: {
      snippet: { title: string; description: string; thumbnails?: Thumbs; publishedAt: string; resourceId: { videoId: string } };
      contentDetails: { videoId: string; videoPublishedAt?: string };
    }[];
  }>("playlistItems", {
    part: "snippet,contentDetails",
    playlistId: c.contentDetails.relatedPlaylists.uploads,
    maxResults: String(Math.min(Math.max(videoLimit, 1), 50)),
  }).catch((e) => {
    // A channel with no uploads has no uploads playlist items (404 → treated as "no videos").
    if (e instanceof AppError && e.code === "UNAVAILABLE" && /rejected/.test(e.message)) return { items: [] };
    throw e;
  });

  const videos: YoutubeVideo[] = (uploads.items ?? [])
    // Deleted / private videos stay in the playlist with placeholder titles; skip them.
    .filter((v) => v.snippet.title !== "Deleted video" && v.snippet.title !== "Private video")
    .map((v) => ({
      videoId: v.contentDetails.videoId,
      title: v.snippet.title,
      description: v.snippet.description,
      publishedAt: v.contentDetails.videoPublishedAt ?? v.snippet.publishedAt,
      thumbnailUrl: thumb(v.snippet.thumbnails),
    }));

  return {
    channelId: c.id,
    title: c.snippet.title,
    description: c.snippet.description,
    handle: c.snippet.customUrl?.startsWith("@") ? c.snippet.customUrl.slice(1) : null,
    thumbnailUrl: thumb(c.snippet.thumbnails),
    subscribers: c.statistics.hiddenSubscriberCount || c.statistics.subscriberCount === undefined ? null : Number(c.statistics.subscriberCount),
    videoCount: Number(c.statistics.videoCount ?? 0),
    videos,
  };
}
