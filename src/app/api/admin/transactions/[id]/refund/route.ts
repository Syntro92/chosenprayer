import { revalidateTag } from "next/cache";
import { adminRoute } from "@/server/admin-route";
import { json } from "@/server/http";
import { getAdminTransaction } from "@/server/services/admin-transactions";
import { adminRefund } from "@/server/services/giving";

/** Body: { reason }. The payment provider is asked first; only a successful refund is recorded. */
export const POST = adminRoute(async (req, { actor, params }) => {
  const { channelHandle } = await adminRefund(actor, params.id, await req.json().catch(() => ({})));
  revalidateTag(`channel:${channelHandle.toLowerCase()}`, "max");
  return json(await getAdminTransaction(actor, params.id));
});
