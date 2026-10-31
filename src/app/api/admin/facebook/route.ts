import { facebookPageSchema } from "@/lib/schemas/admin";
import { adminRoute } from "@/server/admin-route";
import { json, parseQuery } from "@/server/http";
import { lookupFacebookPage } from "@/server/services/facebook";

/** Preview a Facebook Page (details, followers, recent posts) before it is linked. Stores nothing. */
export const GET = adminRoute(async (req, { actor }) => json(await lookupFacebookPage(actor, parseQuery(req, facebookPageSchema))));
