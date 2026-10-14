import { CHANNEL_IMAGE_MAX_BYTES } from "@/lib/channels";
import { adminRoute } from "@/server/admin-route";
import { AppError } from "@/server/errors";
import { json } from "@/server/http";
import { uploadChannelImage } from "@/server/services/admin-channel-images";

export const POST = adminRoute(async (req, { actor }) => {
  // Refuse oversized bodies before buffering them (the service checks the file itself too).
  if (Number(req.headers.get("content-length") ?? 0) > CHANNEL_IMAGE_MAX_BYTES + 100_000) {
    throw new AppError("VALIDATION", "The image is larger than 4 MB.", { fields: { file: "The image is larger than 4 MB." } });
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new AppError("VALIDATION", "Choose an image to upload.", { fields: { file: "Choose an image to upload." } });
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError("VALIDATION", "Choose an image to upload.", { fields: { file: "Choose an image to upload." } });
  return json(await uploadChannelImage(actor, { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }), { status: 201 });
});
