import "server-only";
import { TONE_CLASS } from "@/lib/avatar";
import type { AvatarTone } from "@/lib/schemas/accounts";
import type { Member } from "@/lib/community/types";

/** Columns that describe an author/member; join `public.profiles` as `pr`. */
export const MEMBER_COLUMNS = `
  pr.id as author_id, pr.username::text as username, pr.display_name, pr.bio, pr.avatar_tone, pr.verified,
  to_char(pr.created_at at time zone 'UTC', 'FMMonth YYYY') as joined`;

export interface MemberRow {
  author_id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_tone: AvatarTone;
  verified: boolean;
  joined: string;
}

export const toMember = (r: MemberRow): Member => ({
  id: r.author_id,
  name: r.display_name,
  username: r.username,
  bio: r.bio,
  joined: r.joined,
  tone: TONE_CLASS[r.avatar_tone] ?? TONE_CLASS.cream,
  ...(r.verified ? { verified: true } : {}),
});

/** Timestamp text with full microsecond precision: safe to use as a keyset cursor value. */
export const ISO_US = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`;

/** Escapes LIKE wildcards so user text is matched literally. */
export const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Collects the distinct members referenced by a set of rows. */
export function collectMembers(rows: MemberRow[]): Member[] {
  const byId = new Map<string, Member>();
  for (const r of rows) if (!byId.has(r.author_id)) byId.set(r.author_id, toMember(r));
  return [...byId.values()];
}

export const PG_BAD_INPUT = new Set(["22P02", "22007", "22003"]);
