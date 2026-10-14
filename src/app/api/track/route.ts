import { getEnv } from "@/server/env";
import { clientIp, handler, parseJson } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { classifyDevice, cleanCountry, cleanPath, cleanReferrer, readVisitorId, recordPageView, trackSchema, VISITOR_COOKIE } from "@/server/services/analytics";

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Page-view beacon: POST { path, referrer? }. Always answers 204 and never blocks a page: an
 * ignored page, a rate-limited visitor and a bot all look the same to the browser. The visitor id
 * is our own first-party cookie (a random uuid, no personal data).
 */
export const POST = handler(async (req) => {
  await enforceRateLimit("track", clientIp(req));
  const body = await parseJson(req, trackSchema);

  const path = cleanPath(body.path);
  const existing = readVisitorId(req.headers.get("cookie"));
  const visitorId = existing ?? crypto.randomUUID();

  if (path) {
    await recordPageView({
      visitorId,
      path,
      referrer: cleanReferrer(body.referrer, req.headers.get("host")),
      country: cleanCountry(req.headers.get("x-vercel-ip-country") ?? req.headers.get("cf-ipcountry")),
      device: classifyDevice(req.headers.get("user-agent")),
    });
  }

  const headers = new Headers({ "Cache-Control": "no-store" });
  if (!existing) {
    const secure = getEnv().NODE_ENV === "production" ? "; Secure" : "";
    headers.append("Set-Cookie", `${VISITOR_COOKIE}=${visitorId}; Path=/; Max-Age=${ONE_YEAR}; HttpOnly; SameSite=Lax${secure}`);
  }
  return new Response(null, { status: 204, headers });
});
