import { adminRoute } from "@/server/admin-route";
import { getPaymentsMode } from "@/server/providers/payments";
import { json } from "@/server/http";
import { getHealth } from "@/server/services/admin-insights";

export const GET = adminRoute(async (_req, { actor }) => {
  const { provider, testMode } = getPaymentsMode();
  return json(await getHealth(actor, { name: provider, testMode }));
});
