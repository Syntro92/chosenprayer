import "server-only";
import { randomUUID } from "node:crypto";
import { CHANNEL_IMAGE_MAX_BYTES, CHANNEL_IMAGE_MIME_BY_EXT } from "@/lib/channels";
import { extOf } from "@/lib/community/config";
import { requireRole, type Actor } from "../auth/policy";
import { AppError } from "../errors";
import { channelImageUrl, channelImages } from "../storage";

const bad = (message: string) => new AppError("VALIDATION", message, { fields: { file: message } });

/** The first bytes of a real JPEG / PNG / WebP, so a renamed file can't slip through on its extension. */
function matchesType(ext: string, b: Uint8Array): boolean {
  if (ext === ".jpg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (ext === ".png") return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (ext === ".webp") {
    const tag = (at: number) => String.fromCharCode(...b.slice(at, at + 4));
    return tag(0) === "RIFF" && tag(8) === "WEBP";
  }
  return false;
}

export interface UploadedChannelImage {
  /** Storage key to send back when saving the channel. */
  path: string;
  /** Public URL, for the preview. */
  url: string;
}

/**
 * Step 1 of giving a channel a picture: store the file and hand back its key. Nothing points at it
 * until the channel is created/updated with that key, so an abandoned upload is just an unused file.
 */
export async function uploadChannelImage(
  actor: Actor | null,
  file: { name: string; bytes: Uint8Array },
  store: Pick<typeof channelImages, "upload"> = channelImages,
): Promise<UploadedChannelImage> {
  requireRole(actor, "admin");
  // .jpeg is the same format as .jpg; store it under one extension.
  const ext = extOf(file.name) === ".jpeg" ? ".jpg" : extOf(file.name);
  if (!(ext in CHANNEL_IMAGE_MIME_BY_EXT)) throw bad("Use a JPG, PNG or WebP image.");
  if (file.bytes.byteLength === 0) throw bad("That file is empty.");
  if (file.bytes.byteLength > CHANNEL_IMAGE_MAX_BYTES) throw bad("The image is larger than 4 MB.");
  if (!matchesType(ext, file.bytes)) throw bad("That file isn't a valid JPG, PNG or WebP image.");

  const path = `channels/${randomUUID()}${ext}`;
  await store.upload(path, file.bytes, CHANNEL_IMAGE_MIME_BY_EXT[ext]);
  return { path, url: channelImageUrl(path)! };
}
