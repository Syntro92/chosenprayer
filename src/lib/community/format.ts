import { FILE_EXTS, IMAGE_EXTS, LIMITS, MAX_SIZE_LABEL, ALLOWED_LABEL, extOf, kindOf } from "./config";
import type { Attachment, DraftAttachment } from "./types";

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatAge(minutes: number) {
  const m = Math.floor(minutes);
  if (m < 1) return "Just now";
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  const w = Math.floor(d / 7);
  return `${w} week${w === 1 ? "" : "s"} ago`;
}

export function fileTypeLabel(name: string) {
  return extOf(name).replace(".", "").toUpperCase() || "FILE";
}

let counter = 0;
export const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

/** Frontend validation only. The backend must repeat these checks. */
export function validateFile(file: File, existing: Attachment[]): string | null {
  const kind = kindOf(file.name);
  if (!kind) {
    return `"${file.name}" isn't a supported format. Allowed: ${ALLOWED_LABEL}.`;
  }
  const okExt = [...IMAGE_EXTS, ...FILE_EXTS].includes(extOf(file.name) as never);
  if (!okExt) return `"${file.name}" isn't a supported format.`;
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (file.size > LIMITS.maxFileBytes) {
    return `"${file.name}" is ${formatBytes(file.size)}. The limit is ${MAX_SIZE_LABEL}.`;
  }
  if (existing.length >= LIMITS.maxFiles) {
    return `You can attach up to ${LIMITS.maxFiles} files to one post.`;
  }
  if (kind === "image" && existing.filter((a) => a.kind === "image").length >= LIMITS.maxImages) {
    return `You can attach up to ${LIMITS.maxImages} images to one post.`;
  }
  if (existing.some((a) => (a as DraftAttachment).file?.name === file.name && (a as DraftAttachment).file?.size === file.size)) {
    return `"${file.name}" is already attached.`;
  }
  return null;
}
