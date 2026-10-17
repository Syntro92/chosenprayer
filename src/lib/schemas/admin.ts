import { z } from "zod";
import { CHANNEL_IMAGE_PATH_RE, HERO_IMAGE_PATH_RE } from "../channels";
import { GIVING_LIMITS, MAX_PRESETS } from "../giving";
import { displayNameField, emailField, passwordField } from "./accounts";

// Admin API inputs. Validated again on the server; the Vue panel may reuse the shapes.

const page = z.coerce.number().int().min(1).max(10_000).default(1);
const pageSize = z.coerce.number().int().min(1).max(100).default(20);
const text = (max: number) => z.string().trim().max(max);
/** Empty query-string values ("?q=") mean "not set". */
const optional = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (v === "" ? undefined : v), s.optional());

export const CHANNEL_STATUSES = ["pending", "active", "paused", "archived"] as const;
export const DONATION_STATUSES = ["pending", "succeeded", "failed", "refunded", "canceled"] as const;
export const DONATION_SOURCES = ["web", "mobile", "social", "email", "offline", "other"] as const;
export const ROLES = ["member", "admin"] as const;
export const ACCOUNT_STATUSES = ["active", "suspended"] as const;

export const adminChannelListSchema = z.object({
  q: optional(text(80)),
  status: optional(z.enum(CHANNEL_STATUSES)),
  page,
  pageSize,
});

const handle = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9_]{2,29}$/, "3–30 letters, numbers or underscores");

const channelFields = {
  name: z.string().trim().min(1, "Name is required").max(80),
  description: text(200).default(""),
  mission: text(600).default(""),
  about: z.array(z.string().trim().min(1).max(1500)).max(10).default([]),
  category: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{1,40}$/, "Unknown category"),
  coverTone: z.enum(["cream", "mist", "sage", "stone"]).default("cream"),
  coverScene: z.enum(["horizon", "hills", "sun", "waves"]).default("horizon"),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code").default("USD"),
  featured: z.boolean().default(false),
  verified: z.boolean().default(false),
  showBlessings: z.boolean().default(true),
};

/** Storage key returned by the image upload endpoint. null (update only) removes the image. */
const imagePath = z.string().regex(CHANNEL_IMAGE_PATH_RE, "Invalid image");

export const createChannelSchema = z.object({
  handle,
  ...channelFields,
  avatarPath: imagePath.nullish(),
  coverPath: imagePath.nullish(),
  /** Defaults to active: an admin creating a channel is the approval. */
  status: z.enum(CHANNEL_STATUSES).default("active"),
  /** Optional: the member who runs this channel. */
  ownerUsername: optional(z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/, "Unknown username")),
  /** Optional: YouTube channel ID (UC…), channel link or @handle. Subscribers and videos are fetched server-side. */
  youtubeChannel: optional(text(200)),
});

export const youtubeChannelSchema = z.object({ channel: z.string().trim().min(1, "Enter a YouTube channel ID").max(200) });
/** POST /channels/:id/youtube: with a value it (re)links the channel; without, it re-syncs the linked one. */
export const youtubeSyncSchema = z.object({ youtubeChannel: optional(text(200)) });

/** PATCH: any subset of the editable fields. The handle is the public URL, so it never changes. */
export const updateChannelSchema = z
  .object({
    name: channelFields.name,
    description: text(200),
    mission: text(600),
    about: z.array(z.string().trim().min(1).max(1500)).max(10),
    category: channelFields.category,
    coverTone: z.enum(["cream", "mist", "sage", "stone"]),
    coverScene: z.enum(["horizon", "hills", "sun", "waves"]),
    avatarPath: imagePath.nullable(),
    coverPath: imagePath.nullable(),
    featured: z.boolean(),
    verified: z.boolean(),
    showBlessings: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

/** Admin > Channels > Support settings: one set of values for the whole site. */
export const givingSettingsSchema = z
  .object({
    minDonation: z.number({ message: "Enter a whole amount" }).int("Use a whole amount").min(1, "The minimum can't be below 1").max(GIVING_LIMITS.maxAmount, `At most ${GIVING_LIMITS.maxAmount.toLocaleString("en")}`),
    presets: z
      .array(
        z.number({ message: "Use whole amounts" }).int("Use whole amounts").min(1, "Amounts must be at least 1").max(GIVING_LIMITS.maxAmount, `At most ${GIVING_LIMITS.maxAmount.toLocaleString("en")}`),
      )
      .min(1, "Pick at least one amount")
      .max(MAX_PRESETS, `At most ${MAX_PRESETS} amounts`)
      .transform((a) => [...new Set(a)].sort((x, y) => x - y)),
    showTopSupporters: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.presets.some((n) => n < v.minDonation)) {
      ctx.addIssue({ code: "custom", path: ["presets"], message: `Every amount must be at least ${v.minDonation} (the minimum donation)` });
    }
  });

export const channelStatusSchema = z.object({
  status: z.enum(CHANNEL_STATUSES),
  note: optional(text(300)),
});

export const adminTransactionListSchema = z.object({
  q: optional(text(80)),
  status: optional(z.enum(DONATION_STATUSES)),
  source: optional(z.enum(DONATION_SOURCES)),
  channel: optional(handle),
  from: optional(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")),
  to: optional(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")),
  page,
  pageSize,
});

export const adminUserListSchema = z.object({
  q: optional(text(80)),
  role: optional(z.enum(ROLES)),
  status: optional(z.enum(ACCOUNT_STATUSES)),
  page,
  pageSize,
});

export const updateUserSchema = z
  .object({
    role: z.enum(ROLES),
    status: z.enum(ACCOUNT_STATUSES),
    verified: z.boolean(),
    /** Required when suspending. */
    reason: text(300),
  })
  .partial()
  .refine((v) => v.role !== undefined || v.status !== undefined || v.verified !== undefined, "Nothing to update");

/** An admin creating an account directly: no sign-up form, no email round trip. */
export const createUserSchema = z.object({
  fullName: displayNameField,
  email: emailField,
  password: passwordField,
  role: z.enum(["member", "admin"]).default("member"),
});

export const settingsSchema = z.object({
  siteName: z.string().trim().min(1, "Site name is required").max(80),
  contactEmail: z.preprocess((v) => (v === "" ? null : v), z.string().trim().email("Enter a valid email").max(254).nullable()),
  defaultCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code"),
  notifyOnDonation: z.boolean(),
  /** Landing-page cover key from the upload step; null = back to the default; omitted = unchanged. */
  heroImagePath: z.string().regex(HERO_IMAGE_PATH_RE, "Upload the image again").nullable().optional(),
});

export const RANGES = { "7d": 7, "30d": 30, "90d": 90 } as const;
export const analyticsQuerySchema = z.object({
  range: z.enum(["7d", "30d", "90d"]).default("30d"),
  /** Limit traffic and giving to one channel (its id). */
  channel: optional(z.string().uuid()),
});

export const auditQuerySchema = z.object({
  entityType: optional(z.enum(["post", "comment", "report", "user", "donation", "channel", "setting"])),
  cursor: optional(z.string().max(500)),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const adminSignInSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(200),
});
