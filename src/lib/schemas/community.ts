import { z } from "zod";
import { LIMITS } from "@/lib/community/config";

// Client-safe input schemas for the community features (the server validates again).

export const uuidSchema = z.string().uuid("Invalid id");

const postText = z.string().trim().max(LIMITS.maxPostChars, `Posts can be up to ${LIMITS.maxPostChars} characters.`);

export const attachmentRefSchema = z.object({
  /** Storage key returned by requestUploadUrls, e.g. posts/<userId>/<uuid>.png */
  key: z.string().min(10).max(200),
  /** The file's original name, shown to readers. */
  name: z.string().trim().min(1).max(255),
});

export const createPostSchema = z.object({
  text: postText.default(""),
  attachments: z.array(attachmentRefSchema).max(LIMITS.maxFiles).default([]),
});

export const editPostSchema = z.object({ text: postText });

export const FEED_TABS = ["feed", "mine"] as const;
export const FEED_FILTERS = ["latest", "popular", "media"] as const;

export const feedQuerySchema = z.object({
  tab: z.enum(FEED_TABS).default("feed"),
  filter: z.enum(FEED_FILTERS).default("latest"),
  q: z.string().trim().max(80).optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(30).default(10),
});
export type FeedQueryInput = z.input<typeof feedQuerySchema>;

export const pageQuerySchema = z.object({
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(30).default(10),
});

export const addCommentSchema = z.object({
  postId: uuidSchema,
  parentId: uuidSchema.optional(),
  text: z
    .string()
    .trim()
    .min(1, "Please write something before sending.")
    .max(LIMITS.maxCommentChars, `Comments can be up to ${LIMITS.maxCommentChars} characters.`),
});

export const editCommentSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Please write something before sending.")
    .max(LIMITS.maxCommentChars, `Comments can be up to ${LIMITS.maxCommentChars} characters.`),
});

export const uploadRequestSchema = z.object({
  files: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(255),
        size: z.number().int().positive().max(LIMITS.maxFileBytes, "Files can be up to 5 MB."),
      }),
    )
    .min(1)
    .max(LIMITS.maxFiles),
});

export const reportSchema = z.object({
  reason: z.enum(["spam", "harassment", "inappropriate", "other"]),
  note: z.string().trim().max(300, "Notes can be up to 300 characters.").default(""),
});
