import { youtubeChannelSchema } from "@/lib/schemas/admin";
import { adminRoute } from "@/server/admin-route";
import { json, parseQuery } from "@/server/http";
import { lookupYoutubeChannel } from "@/server/services/youtube";

/** Preview a YouTube channel (details, subscribers, recent videos) before it is linked. Stores nothing. */
export const GET = adminRoute(async (req, { actor }) => json(await lookupYoutubeChannel(actor, parseQuery(req, youtubeChannelSchema))));
