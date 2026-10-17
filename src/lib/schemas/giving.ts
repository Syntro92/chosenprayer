import { z } from "zod";
import { DONATION_SOURCES, GIVING_LIMITS } from "@/lib/giving";
import { emailField } from "./accounts";
import { handleSchema } from "./channels";
import { uuidSchema } from "./community";

// Client-safe input schemas for giving (the server validates again).

export const startDonationSchema = z.object({
  channelHandle: handleSchema,
  /** Whole currency units, as the form works in. */
  amount: z.coerce
    .number()
    .int("Enter a whole amount")
    .min(1, "Enter an amount")
    .max(GIVING_LIMITS.maxAmount, `The maximum is ${GIVING_LIMITS.maxAmount.toLocaleString("en")}`),
  frequency: z.enum(["once", "monthly"]).default("once"),
  /** Guests only; signed-in members are identified by their account. */
  donorName: z.string().trim().max(80).optional(),
  donorEmail: emailField.optional(),
  source: z.enum(DONATION_SOURCES).default("web"),
  /** Makes retries safe: the same key always returns the same donation. */
  idempotencyKey: z.string().trim().min(8, "Missing request key").max(100),
});

export const blessingSchema = z.object({
  donationId: uuidSchema,
  /** The secret from startDonation: lets a guest (no account) leave their blessing. */
  token: z.string().min(10).max(100).optional(),
  message: z.string().trim().min(1, "Write a short message first.").max(500, "Keep it to 500 characters."),
  displayName: z.string().trim().max(80).optional(),
  anonymous: z.boolean().default(false),
  showAmount: z.boolean().default(false),
});

export const donationLookupSchema = z.object({
  donationId: uuidSchema,
  token: z.string().min(10).max(100).optional(),
});
