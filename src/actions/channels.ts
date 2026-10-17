"use server";

import { action } from "@/server/action";
import { listRecentSupporters } from "@/server/services/channels";

/** "Load more" on a channel's Recent Supporters list. Public: same masked data as the page itself. */
export async function loadRecentSupportersAction(handle: string, cursor: string | null) {
  return action("loadRecentSupporters", async () => listRecentSupporters(handle, cursor));
}
