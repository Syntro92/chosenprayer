import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { handleSchema, type ChannelListInput } from "@/lib/schemas/channels";
import {
  getChannelProfile,
  getFeaturedChannel,
  listCategories,
  listChannels,
  parseChannelQuery,
} from "../services/channels";

/**
 * Cached views of the PUBLIC channel data (Next 16 Cache Components).
 *
 * These live apart from the services on purpose: the services hold the rules and are
 * tested directly against the database; this file only adds Next cache directives.
 * Everything cached here is identical for every visitor. Anything per-user (am I
 * following this?) is NOT cached and is fetched separately.
 *
 * Two rules for `use cache` functions:
 *  - Errors thrown inside them lose their type, so validate BEFORE the cached call
 *    (the *Public wrappers below) and return null instead of throwing for "not found".
 *  - Arguments must already be valid, so junk input never creates cache entries.
 *
 * Invalidate with revalidateTag("channels") for the directory or
 * revalidateTag(`channel:${handle}`) for one profile.
 */

export async function getCategoriesCached() {
  "use cache";
  cacheLife("hours");
  cacheTag("categories");
  return listCategories();
}

async function listChannelsCached(input: ChannelListInput) {
  "use cache";
  cacheLife("minutes");
  cacheTag("channels");
  return listChannels(input);
}

/** Directory page for any (untrusted) query. Throws VALIDATION for bad input, before any caching. */
export async function listChannelsPublic(raw: ChannelListInput) {
  const { input } = parseChannelQuery(raw);
  return listChannelsCached(input);
}

export async function getFeaturedChannelCached() {
  "use cache";
  cacheLife("minutes");
  cacheTag("channels");
  return getFeaturedChannel();
}

async function getChannelProfileCached(handle: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag("channels", `channel:${handle}`);
  try {
    return await getChannelProfile(handle);
  } catch (e) {
    if ((e as { code?: string } | null)?.code === "NOT_FOUND") return null;
    throw e;
  }
}

/** A channel public profile, or null if it does not exist or is not active. */
export async function getChannelProfilePublic(rawHandle: string) {
  const parsed = handleSchema.safeParse(rawHandle);
  if (!parsed.success) return null;
  return getChannelProfileCached(parsed.data);
}
