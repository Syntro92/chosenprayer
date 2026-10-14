/**
 * Community configuration. The UI uses these for instant feedback; the server
 * re-validates everything (type, size, count, permissions) with the same numbers.
 */
export const LIMITS = {
  maxFileBytes: 5 * 1024 * 1024, // 5 MB per file
  maxFiles: 6, // images + documents together
  maxImages: 4,
  maxPostChars: 1000,
  maxCommentChars: 500,
  collapsePostAt: 280, // characters before "Read more"
  commentsPreview: 2,
} as const;

/** Private Supabase Storage bucket holding post attachments. */
export const ATTACHMENT_BUCKET = "community-attachments";

export const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".gif"] as const;
export const FILE_EXTS = [".pdf", ".txt", ".docx"] as const;

/** The one MIME type each extension may carry. The server decides the type from the extension. */
export const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const FILE_MIMES = [
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export const ACCEPT_IMAGES = [...IMAGE_MIMES, ...IMAGE_EXTS].join(",");
export const ACCEPT_FILES = [...FILE_MIMES, ...FILE_EXTS].join(",");

export const ALLOWED_LABEL = "JPG, PNG, WebP, GIF, PDF, TXT, DOCX";
export const MAX_SIZE_LABEL = "5 MB per file";

export function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i).toLowerCase();
}

export function kindOf(name: string): "image" | "file" | null {
  const ext = extOf(name);
  if ((IMAGE_EXTS as readonly string[]).includes(ext)) return "image";
  if ((FILE_EXTS as readonly string[]).includes(ext)) return "file";
  return null;
}
