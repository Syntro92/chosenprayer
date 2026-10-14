import "server-only";
import { randomUUID } from "node:crypto";
import { LIMITS, MIME_BY_EXT, extOf, kindOf } from "@/lib/community/config";
import type { Attachment } from "@/lib/community/types";
import { uploadRequestSchema } from "@/lib/schemas/community";
import { requireMember, type Actor } from "../auth/policy";
import { db, rows, type Queryable } from "../db";
import { AppError } from "../errors";
import { enforceRateLimit } from "../rate-limit";
import { ATTACHMENT_BUCKET, storage as realStorage, type Storage } from "../storage";

export interface UploadTarget {
  /** Echoed back so the client can match targets to files. */
  name: string;
  key: string;
  token: string;
}

/** Storage keys look like posts/<userId>/<uuid>.<ext>. The user id in the path is the ownership proof. */
const keyPattern = (userId: string) =>
  new RegExp(`^posts/${userId}/[0-9a-f-]{36}\\.(jpg|jpeg|png|webp|gif|pdf|txt|docx)$`);

/**
 * Step 1 of attaching files: validate what the browser plans to upload and hand back
 * one-time upload permissions. Nothing is stored yet, and nothing is trusted:
 * createPost re-checks the real stored files.
 */
export async function requestUploadUrls(
  actor: Actor | null,
  raw: unknown,
  conn: Queryable = db,
  store: Storage = realStorage,
): Promise<UploadTarget[]> {
  const a = requireMember(actor);
  const { files } = uploadRequestSchema.parse(raw);
  await enforceRateLimit("upload", a.userId, conn);

  let images = 0;
  for (const f of files) {
    const kind = kindOf(f.name);
    if (!kind) throw new AppError("VALIDATION", `"${f.name}" isn't a supported file type.`, { fields: { files: "Unsupported file type" } });
    if (kind === "image") images++;
  }
  if (images > LIMITS.maxImages) {
    throw new AppError("VALIDATION", `You can attach up to ${LIMITS.maxImages} images to one post.`, { fields: { files: "Too many images" } });
  }

  const targets: UploadTarget[] = [];
  for (const f of files) {
    const key = `posts/${a.userId}/${randomUUID()}${extOf(f.name)}`;
    const t = await store.createUploadTarget(key);
    targets.push({ name: f.name, key: t.path, token: t.token });
  }
  return targets;
}

export interface VerifiedUpload {
  key: string;
  name: string;
  kind: "image" | "file";
  mime: string;
  size: number;
}

/**
 * Step 2: before a post is saved, confirm each referenced file exists in storage, belongs
 * to this user, and really is what it claims (type and size come from storage's own
 * record, not from anything the browser told us).
 */
export async function verifyUploads(
  userId: string,
  refs: { key: string; name: string }[],
  conn: Queryable,
): Promise<VerifiedUpload[]> {
  if (refs.length === 0) return [];
  const pattern = keyPattern(userId);
  const seen = new Set<string>();
  for (const r of refs) {
    if (!pattern.test(r.key)) throw new AppError("VALIDATION", "One of the attachments isn't valid.", { fields: { attachments: "Invalid attachment" } });
    if (seen.has(r.key)) throw new AppError("VALIDATION", "The same file was attached twice.", { fields: { attachments: "Duplicate attachment" } });
    seen.add(r.key);
  }

  const stored = await rows<{ name: string; size: number | null; mime: string | null }>(
    `select name, (metadata ->> 'size')::bigint as size, metadata ->> 'mimetype' as mime
     from storage.objects where bucket_id = $1 and name = any($2)`,
    [ATTACHMENT_BUCKET, refs.map((r) => r.key)],
    conn,
  );
  const byKey = new Map(stored.map((s) => [s.name, s]));

  return refs.map((r) => {
    const s = byKey.get(r.key);
    if (!s || !s.mime || s.size == null) {
      throw new AppError("VALIDATION", `"${r.name}" didn't finish uploading. Please try again.`, { fields: { attachments: "Upload not found" } });
    }
    const ext = extOf(r.key);
    if (MIME_BY_EXT[ext] !== s.mime) {
      throw new AppError("VALIDATION", `"${r.name}" isn't the type it claims to be.`, { fields: { attachments: "File type mismatch" } });
    }
    if (s.size <= 0 || s.size > LIMITS.maxFileBytes) {
      throw new AppError("VALIDATION", `"${r.name}" is larger than 5 MB.`, { fields: { attachments: "File too large" } });
    }
    return { key: r.key, name: r.name, kind: kindOf(r.key)!, mime: s.mime, size: Number(s.size) };
  });
}

/** Loads attachments for a set of posts and attaches short-lived signed URLs. */
export async function attachmentsByPost(
  postIds: string[],
  conn: Queryable,
  store: Storage,
): Promise<Map<string, Attachment[]>> {
  const out = new Map<string, Attachment[]>();
  if (postIds.length === 0) return out;
  const list = await rows<{
    id: string; post_id: string; kind: "image" | "file"; name: string; size_bytes: number;
    mime: string; storage_path: string; alt: string | null;
  }>(
    `select id, post_id, kind, name, size_bytes, mime, storage_path, alt
     from public.post_attachments where post_id = any($1::uuid[]) order by post_id, position, created_at`,
    [postIds],
    conn,
  );
  const urls = await store.signedUrls(list.map((r) => r.storage_path));
  for (const r of list) {
    const url = urls.get(r.storage_path);
    const att: Attachment = {
      id: r.id,
      kind: r.kind,
      name: r.name,
      size: r.size_bytes,
      mime: r.mime,
      ...(url
        ? {
            ...(r.kind === "image" ? { src: url } : {}),
            href: `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(r.name)}`,
          }
        : {}),
      ...(r.alt ? { alt: r.alt } : {}),
    };
    (out.get(r.post_id) ?? out.set(r.post_id, []).get(r.post_id)!).push(att);
  }
  return out;
}
