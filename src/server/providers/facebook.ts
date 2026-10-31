import "server-only";
import { getEnv } from "../env";
import { AppError } from "../errors";

// Facebook Graph API (read-only, page or app access token). The page fields request and the posts
// edge are each one request, so a full sync of one page is 2 requests.

const API_VERSION = "v21.0";
const API = `https://graph.facebook.com/${API_VERSION}`;
const PAGE_ID_RE = /^[0-9]{5,20}$/;

export interface FacebookPost {
  postId: string;
  message: string;
  createdAt: string;
  thumbnailUrl: string | null;
  permalinkUrl: string | null;
}

export interface FacebookPage {
  pageId: string;
  title: string;
  description: string;
  /** the page's vanity username, when it has one */
  username: string | null;
  thumbnailUrl: string | null;
  /** null when Facebook doesn't report a follower/like count for this page */
  followers: number | null;
  posts: FacebookPost[];
}

type Ref = { by: "id"; value: string } | { by: "username"; value: string };

/** Accepts a numeric page id, a facebook.com/PageName or /profile.php?id=… link, or a bare page name. */
export function parsePageRef(input: string): Ref {
  const s = input.trim();
  if (PAGE_ID_RE.test(s)) return { by: "id", value: s };
  const byId = /facebook\.com\/profile\.php\?id=(\d{5,20})/i.exec(s) ?? /facebook\.com\/(\d{5,20})(?:[/?]|$)/i.exec(s);
  if (byId) return { by: "id", value: byId[1] };
  const link = /facebook\.com\/([A-Za-z0-9.]{3,80})(?:[/?]|$)/i.exec(s);
  const name = link ? link[1] : /^[A-Za-z0-9.]{3,80}$/.test(s) ? s : null;
  if (name && !["profile.php", "pages", "people", "pg"].includes(name.toLowerCase())) return { by: "username", value: name };
  throw new AppError("VALIDATION", "Enter a Facebook Page ID, a page link, or the page's username.", {
    fields: { facebookPage: "Not a valid Facebook Page" },
  });
}

async function call<T>(path: string, params: Record<string, string>, token: string): Promise<T> {
  const url = `${API}/${path}?${new URLSearchParams({ ...params, access_token: token })}`;
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new AppError("UNAVAILABLE", "Couldn't reach Facebook. Try again in a moment.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { code?: number; message?: string } } | null;
    const code = body?.error?.code;
    // 4 = app-level rate limit, 17 = user-level rate limit, 32 = page-level rate limit.
    if (code === 4 || code === 17 || code === 32) throw new AppError("UNAVAILABLE", "Facebook's request limit was reached. Try again later.");
    // Never echo the token or Facebook's raw message to the browser.
    throw new AppError("UNAVAILABLE", "Facebook rejected the request. Check that FACEBOOK_ACCESS_TOKEN is valid and has access to this page.");
  }
  return (await res.json()) as T;
}

function requireToken(): string {
  const token = getEnv().FACEBOOK_ACCESS_TOKEN;
  if (!token) throw new AppError("UNAVAILABLE", "Facebook isn't set up yet: add FACEBOOK_ACCESS_TOKEN to the server environment.");
  return token;
}

/** Page details, follower count and the latest `postLimit` public posts. */
export async function fetchFacebookPage(input: string, postLimit = 12): Promise<FacebookPage> {
  const ref = parsePageRef(input);
  const token = requireToken();

  const page = await call<{
    id: string;
    name: string;
    about?: string;
    username?: string;
    fan_count?: number;
    followers_count?: number;
    picture?: { data?: { url?: string } };
    /** Page-scoped token, returned when FACEBOOK_ACCESS_TOKEN is a user token that manages this page. */
    access_token?: string;
  }>(ref.value, { fields: "id,name,about,username,fan_count,followers_count,picture.type(large),access_token" }, token).catch((e) => {
    if (e instanceof AppError && e.code === "UNAVAILABLE" && /rejected/.test(e.message)) {
      // Facebook deliberately returns the same error whether the ID is wrong or just not accessible
      // (so an outsider can't probe which pages exist). Without Page Public Content Access review,
      // FACEBOOK_ACCESS_TOKEN can only read pages its own owner manages, which is the common case here.
      throw new AppError(
        "NOT_FOUND",
        "No Facebook Page found for that ID, or it isn't accessible with the configured access token (only pages its owner manages can be linked).",
        { fields: { facebookPage: "Not found, or not accessible with this token" } },
      );
    }
    throw e;
  });

  // Pages on Facebook's newer "Pages experience" refuse to return posts to a user token directly;
  // the page's own token (just fetched above) reads posts either way, so prefer it when present.
  const pageToken = page.access_token ?? token;
  const posts = await call<{
    data?: { id: string; message?: string; created_time: string; full_picture?: string; permalink_url?: string }[];
  }>(`${page.id}/posts`, {
    fields: "id,message,created_time,full_picture,permalink_url",
    limit: String(Math.min(Math.max(postLimit, 1), 50)),
  }, pageToken).catch(() => ({ data: [] as never[] }));

  return {
    pageId: page.id,
    title: page.name,
    description: page.about ?? "",
    username: page.username ?? null,
    thumbnailUrl: page.picture?.data?.url ?? null,
    followers: page.followers_count ?? page.fan_count ?? null,
    posts: (posts.data ?? []).map((p) => ({
      postId: p.id,
      message: p.message ?? "",
      createdAt: p.created_time,
      thumbnailUrl: p.full_picture ?? null,
      permalinkUrl: p.permalink_url ?? null,
    })),
  };
}
