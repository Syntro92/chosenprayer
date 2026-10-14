import { z } from "zod";

// Client-safe: the directory UI builds these queries; the server validates them again.

export const CHANNEL_SCOPES = ["all", "large", "growing"] as const;
export const CHANNEL_SORTS = ["popular", "newest", "name"] as const;

export const channelListSchema = z.object({
  /** Free text: matches name, handle, description and category name. */
  q: z.string().trim().max(80).optional(),
  /** Category slug, e.g. "faith". */
  category: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{1,40}$/, "Unknown category")
    .optional(),
  /** "large" = 10K+ followers, "growing" = under 10K. */
  scope: z.enum(CHANNEL_SCOPES).default("all"),
  sort: z.enum(CHANNEL_SORTS).default("popular"),
  /** The directory shows the featured channel in its own section while browsing. */
  featured: z.enum(["exclude", "only"]).optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

export type ChannelListInput = z.input<typeof channelListSchema>;
export type ChannelListQuery = z.output<typeof channelListSchema>;

export const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9_]{2,29}$/);
