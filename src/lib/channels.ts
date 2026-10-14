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

export type Channel = {
  handle: string; // without the leading "@"; also the profile route slug
  name: string;
  description: string;
  category: string; // display name, e.g. "Faith"
  categorySlug: string;
  followers: number;
  supporters: number;
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

export type ChannelProfileData = {
  about: string[];
  mission: string;
  links: { label: string; href: string }[];
  content: ChannelContent[];
  blessings: Blessing[];
  blessingsCount: number;
  /** False when an admin turned blessings off for this channel (the page then hides them entirely). */
  showBlessings: boolean;
};

const compact = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const full = new Intl.NumberFormat("en");

export const formatFollowers = (n: number) =>
  n >= 1000 ? compact.format(n) : full.format(n);
export const formatSupporters = (n: number) => full.format(n);

export const formatDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
