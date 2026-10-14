import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db, one } from "../db";
import { channelImageUrl } from "../storage";

/** Landing-page cover chosen in Admin > Settings; null = the built-in hero. Refreshed by revalidateTag("site"). */
export async function getHeroImageUrlCached(): Promise<string | null> {
  "use cache";
  cacheLife("hours");
  cacheTag("site");
  const r = await one<{ hero_image_path: string | null }>("select hero_image_path from public.site_settings where id", [], db);
  return channelImageUrl(r?.hero_image_path);
}

/** Total visible blessings across all channels, for the landing-page counter. */
export async function getBlessingsCountCached(): Promise<number> {
  "use cache";
  cacheLife("minutes");
  cacheTag("site", "blessings");
  const r = await one<{ n: number }>("select count(*)::int as n from public.blessings where status = 'visible'", [], db);
  return r?.n ?? 0;
}
