import "server-only";
import { CHANNEL_IMAGE_BUCKET } from "@/lib/channels";
import { ATTACHMENT_BUCKET } from "@/lib/community/config";
import { createAdminClient } from "./auth/supabase";
import { getEnv } from "./env";
import { AppError } from "./errors";

export { ATTACHMENT_BUCKET };
const SIGNED_URL_SECONDS = 60 * 60;

/**
 * The slice of Supabase Storage the community needs. Behind an interface so the
 * services can be tested without touching real storage.
 */
export interface Storage {
  /** One-time upload permission for `path`. The browser uploads straight to Storage with it. */
  createUploadTarget(path: string): Promise<{ path: string; token: string }>;
  /** Short-lived read URLs for private files. Missing/unsignable paths are simply absent. */
  signedUrls(paths: string[]): Promise<Map<string, string>>;
  /** Best-effort delete. Never throws: a stray file must not fail a user's request. */
  remove(paths: string[]): Promise<void>;
}

/** Public CDN URL of a channel image, or null when the channel has none. */
export function channelImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${getEnv().NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${CHANNEL_IMAGE_BUCKET}/${path}`;
}

/** The public channel-image bucket. Only the server writes to it (service role). */
export const channelImages = {
  async upload(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const { error } = await createAdminClient()
      .storage.from(CHANNEL_IMAGE_BUCKET)
      .upload(path, bytes, { contentType, upsert: false, cacheControl: "31536000" });
    if (error) throw new AppError("UNAVAILABLE", "The image couldn't be saved right now. Please try again.", { cause: error });
  },
  /** Best-effort delete; a stray file must never fail an admin's save. */
  async remove(paths: (string | null | undefined)[]): Promise<void> {
    const list = paths.filter((p): p is string => !!p);
    if (list.length === 0) return;
    try {
      await createAdminClient().storage.from(CHANNEL_IMAGE_BUCKET).remove(list);
    } catch {
      // best effort
    }
  },
};

export const storage: Storage = {
  async createUploadTarget(path) {
    const { data, error } = await createAdminClient().storage.from(ATTACHMENT_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new AppError("UNAVAILABLE", "Uploads are unavailable right now. Please try again.", { cause: error });
    return { path: data.path, token: data.token };
  },

  async signedUrls(paths) {
    const out = new Map<string, string>();
    if (paths.length === 0) return out;
    const { data, error } = await createAdminClient().storage.from(ATTACHMENT_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
    if (error || !data) return out;
    for (const item of data) if (item.signedUrl && item.path) out.set(item.path, item.signedUrl);
    return out;
  },

  async remove(paths) {
    if (paths.length === 0) return;
    try {
      await createAdminClient().storage.from(ATTACHMENT_BUCKET).remove(paths);
    } catch {
      // best effort; the orphan cleanup job (M7) sweeps anything left behind
    }
  },
};
