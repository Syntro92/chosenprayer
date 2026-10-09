/** Shapes ready to map onto future backend entities. */

export type Role = "visitor" | "member" | "moderator";

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
  /** Image source (data URI / object URL / CDN URL). */
  src?: string;
  alt?: string;
  /** Real, downloadable file (object URL or signed URL). Demo samples have none. */
  href?: string;
}

export interface Post {
  id: string;
  authorId: string;
  text: string;
  attachments: Attachment[];
  /** Age at the time the data was created. Avoids server/client clock drift. */
  ageMinutes: number;
  /** Set only for items created in this browser session. */
  createdAt?: number;
  baseLikes: number;
  edited?: boolean;
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  text: string;
  ageMinutes: number;
  createdAt?: number;
  parentId?: string;
  baseLikes: number;
  edited?: boolean;
}

export type ReportReason = "spam" | "harassment" | "inappropriate" | "other";

export interface Notification {
  id: string;
  text: string;
  ageMinutes: number;
  href?: string;
}

export interface DraftAttachment extends Attachment {
  file: File;
}
