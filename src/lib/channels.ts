// Shared channel types and formatters (safe to import from client components).
// Channel DATA comes from the database via src/server/services/channels.ts.

/** Cover treatments: a soft gradient plus one of the line-drawn scenes. */
export type CoverTone = "cream" | "mist" | "sage" | "stone";
export type CoverScene = "horizon" | "hills" | "sun" | "waves";

/** Public Supabase Storage bucket holding channel profile pictures and cover images. */
export const CHANNEL_IMAGE_BUCKET = "channel-images";
export const CHANNEL_IMAGE_MAX_BYTES = 4 * 1024 * 1024; // stays under the 4.5 MB serverless request limit
export const CHANNEL_IMAGE_EXTS = [".jpg", ".png", ".webp"] as const;
export const CHANNEL_IMAGE_MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};
/** Storage keys are server-generated: channels/<uuid>.<ext>. */
export const CHANNEL_IMAGE_PATH_RE = /^channels\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

/** Landing-page cover (Admin > Settings): hero/<uuid>.<ext> in the same public bucket. */
export const HERO_IMAGE_PATH_RE = /^hero\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

export type Channel = {
  handle: string; // without the leading "@"; also the profile route slug
  name: string;
  description: string;
  category: string; // display name, e.g. "Faith"
  categorySlug: string;
  followers: number;
  supporters: number;
  /** YouTube subscribers; null/absent when no YouTube channel is linked or the owner hides the count. */
  subscribers?: number | null;
  createdAt: string; // ISO timestamp, used for "Newest"
  cover: { tone: CoverTone; scene: CoverScene };
  /** Uploaded profile picture / cover photo. Absent: the initial-letter avatar and generated cover are shown. */
  avatarUrl?: string | null;
  coverUrl?: string | null;
  featured?: boolean;
  verified?: boolean;
};

export type ContentKind = "Reflection" | "Video" | "Message" | "Story";

export type ChannelContent = {
  id: string;
  kind: ContentKind;
  title: string;
  excerpt: string;
  date: string; // YYYY-MM-DD
  cover: { tone: CoverTone; scene: CoverScene };
  youtubeId?: string; // 11-character YouTube video id; renders a playable video card
};

export type Blessing = {
  id: string;
  name: string; // "Anonymous" when the supporter chose to stay private
  message: string;
  date: string; // YYYY-MM-DD
  amount?: number; // only present if the supporter chose to show it
};

export type TopSupporter = {
  name: string; // "Anonymous" when the supporter has no name or chose privacy
  total: number; // whole currency units given to this channel (succeeded donations only)
};

export type RecentSupporter = {
  name: string; // "Anonymous" when the supporter has no name or chose privacy
  amount: number; // whole currency units
  paidAt: string; // ISO timestamp; the page turns it into "5 minutes ago"
};

export type ChannelProfileData = {
  /** Link to the channel on YouTube ("View all content"); absent when none is linked. */
  youtubeUrl?: string;
  about: string[];
  mission: string;
  links: { label: string; href: string }[];
  content: ChannelContent[];
  blessings: Blessing[];
  blessingsCount: number;
  /** False when an admin turned blessings off for this channel (the page then hides them entirely). */
  showBlessings: boolean;
  /** False when the site-wide Top Supporters list is switched off (the default); nothing is shown then. */
  showTopSupporters: boolean;
  topSupporters: TopSupporter[];
  /** False when the site-wide Recent Supporters list is switched off; the section is then hidden. */
  showRecentSupporters: boolean;
  recentSupporters: RecentSupporter[];
  /** Opaque cursor for "Load more"; null when the first page was all there is. */
  recentNextCursor: string | null;
  /** Quick-pick amounts on the Support card (site-wide, set in Admin > Channels > Support settings). */
  givingPresets: number[];
};

const compact = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const full = new Intl.NumberFormat("en");

export const formatFollowers = (n: number) =>
  n >= 1000 ? compact.format(n) : full.format(n);
export const formatSupporters = (n: number) => full.format(n);

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago"; falls back to the date after a month. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const secs = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(secs / 3600);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(secs / 86400);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDate(iso.slice(0, 10));
}

export const formatDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
