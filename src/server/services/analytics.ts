import "server-only";
import { z } from "zod";
import { db, type Queryable } from "../db";

/**
 * First-party, anonymous page-view analytics: a random visitor id from our own cookie, the page,
 * an external referrer, a coarse country and device class. No IP address, no user agent string,
 * no account id is stored.
 */

export const trackSchema = z.object({
  path: z.string().min(1).max(500),
  referrer: z.string().max(500).optional(),
});

export type Device = "desktop" | "mobile" | "tablet" | "bot";

const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python-requests|httpclient|preview/i;
const TABLET_RE = /ipad|tablet|kindle|silk|playbook|(android(?!.*mobile))/i;
const MOBILE_RE = /mobi|iphone|ipod|android|blackberry|windows phone/i;

/** Coarse device class from the User-Agent. Missing/empty UAs count as bots. */
export function classifyDevice(ua: string | null | undefined): Device {
  if (!ua || !ua.trim()) return "bot";
  if (BOT_RE.test(ua)) return "bot";
  if (TABLET_RE.test(ua)) return "tablet";
  if (MOBILE_RE.test(ua)) return "mobile";
  return "desktop";
}

/** Pages we never count: the admin panel, APIs and framework internals. */
const IGNORED_PREFIXES = ["/admin", "/api", "/_next", "/auth"];

/** Site-relative path without query or hash; null when it should not be counted. */
export function cleanPath(raw: string): string | null {
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  const path = raw.split(/[?#]/)[0].replace(/\/{2,}/g, "/");
  if (!path || path.length > 500 || /[\u0000-\u001f]/.test(path)) return null;
  const normalized = path.length > 1 ? path.replace(/\/$/, "") : path;
  if (IGNORED_PREFIXES.some((p) => normalized === p || normalized.startsWith(`${p}/`))) return null;
  return normalized;
}

/** External referrers only, reduced to origin + path (no query strings, which can hold tokens). */
export function cleanReferrer(raw: string | undefined, siteHost: string | null): string | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (siteHost && u.host === siteHost) return null;
  return `${u.origin}${u.pathname === "/" ? "" : u.pathname}`.slice(0, 500);
}

export const VISITOR_COOKIE = "cp_vid";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The visitor id from a Cookie header, if it is a well-formed uuid. */
export function readVisitorId(cookieHeader: string | null): string | null {
  for (const part of (cookieHeader ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === VISITOR_COOKIE) {
      const value = v.join("=");
      return UUID_RE.test(value) ? value.toLowerCase() : null;
    }
  }
  return null;
}

export const cleanCountry = (v: string | null | undefined) => (v && /^[A-Za-z]{2}$/.test(v) && v.toUpperCase() !== "XX" ? v.toUpperCase() : null);

export interface PageViewInput {
  visitorId: string;
  path: string;
  referrer: string | null;
  country: string | null;
  device: Device;
}

/** Stores one view. A `/channels/<handle>` path is linked to that channel when it exists. */
export async function recordPageView(v: PageViewInput, conn: Queryable = db): Promise<void> {
  await conn.query(
    `insert into public.page_views (visitor_id, channel_id, path, referrer, country, device)
     values ($1, (select id from public.channels where handle = $5), $2, $3, $4, $6)`,
    [v.visitorId, v.path, v.referrer, v.country, channelHandle(v.path), v.device],
  );
}

/** `/channels/quietmornings` -> `quietmornings` (null for every other page). */
export function channelHandle(path: string): string | null {
  const m = /^\/channels\/([a-z0-9_]{3,30})$/i.exec(path);
  return m ? m[1].toLowerCase() : null;
}
