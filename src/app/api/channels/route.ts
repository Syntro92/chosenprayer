import { channelListSchema } from "@/lib/schemas/channels";
import { listChannelsPublic } from "@/server/cache/channels";
import { clientIp, handler, json, parseQuery } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";

/**
 * Public channel directory: GET /api/channels?q=&category=&scope=&sort=&featured=&cursor=&limit=
 * Same for every visitor, so CDNs may cache it briefly.
 */
export const GET = handler(async (req) => {
  await enforceRateLimit("publicRead", clientIp(req));
  const query = parseQuery(req, channelListSchema);
  const page = await listChannelsPublic(query);
  return json(page, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
});
