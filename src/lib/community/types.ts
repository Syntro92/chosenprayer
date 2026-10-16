/** Shapes shared by the community UI and the server (what the Server Actions return). */

export type Role = "visitor" | "member";

export interface Member {
  id: string;
  name: string;
  username: string;
  bio: string;
  joined: string; // display label, e.g. "March 2025"
  tone: string; // tailwind bg class for the avatar
  /** Only set when verification is genuinely supported. */
  verified?: boolean;
}

export interface Attachment {
  id: string;
  kind: "image" | "file";
  name: string;
  size: number; // bytes
  mime: string;
  /** Image source (short-lived signed URL, or a local object URL while composing). */
  src?: string;
  alt?: string;
  /** Downloadable file (short-lived signed URL, or a local object URL while composing). */
  href?: string;
}

export interface Post {
  id: string;
  authorId: string;
  text: string;
  attachments: Attachment[];
  /** Age when the data was served. Avoids server/client clock drift. */
  ageMinutes: number;
  /** Set only for items created in this browser session (so their age keeps ticking). */
  createdAt?: number;
  /** Likes by everyone EXCEPT the viewer; the UI adds the viewer's own like on top. */
  baseLikes: number;
  commentCount: number;
  edited?: boolean;
  /** Pinned to the top of the feed by an admin. */
  pinned?: boolean;
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  text: string;
  ageMinutes: number;
  createdAt?: number;
  parentId?: string;
  /** Likes by everyone EXCEPT the viewer. */
  baseLikes: number;
  edited?: boolean;
}

export type ReportReason = "spam" | "harassment" | "inappropriate" | "other";

export interface Notification {
  id: string;
  text: string;
  ageMinutes: number;
  href?: string;
  read: boolean;
}

export interface DraftAttachment extends Attachment {
  file: File;
}

/* ---- Wire types returned by the community Server Actions ---- */

export type PostDTO = Post & { likedByMe: boolean };
export type CommentDTO = Comment & { likedByMe: boolean };

export interface FeedPage {
  posts: PostDTO[];
  /** Everyone referenced by `posts`, so the UI can show names without extra requests. */
  members: Member[];
  nextCursor: string | null;
}

export interface NotificationsPage {
  items: Notification[];
  unread: number;
}
