import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Runs before every matched request. Its only job is to keep the Supabase
 * session fresh: when the access token is about to expire it is renewed and the
 * new cookies are written to both the request (so this render sees them) and the
 * response (so the browser stores them).
 *
 * It is deliberately NOT a security boundary. Authorization is enforced in the
 * service layer (src/server/services/*). Route gating (members-only pages, /admin)
 * is added in later milestones, once those pages use real sessions.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Visitors without a session cookie (and misconfigured envs) skip all work.
  const hasSession = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
  if (!url || !key || !hasSession) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
        // Responses that set auth cookies must never be cached by a CDN.
        response.headers.set("Cache-Control", "private, no-store");
      },
    },
  });

  // Validates the session with Supabase and refreshes it if needed.
  await supabase.auth.getUser();
  return response;
}

export const config = {
  // Everything except static assets, the admin SPA bundle and webhooks.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|admin/|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)"],
};
