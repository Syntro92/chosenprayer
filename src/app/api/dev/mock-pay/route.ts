import { revalidateTag } from "next/cache";
import { getActor } from "@/server/auth/session";
import { handler, json } from "@/server/http";
import { simulateMockPayment } from "@/server/services/giving";

/**
 * TEST MODE ONLY. POST { donationId, token, outcome } where outcome is one of
 * succeeded | failed | refunded | renew | past_due | cancel_subscription.
 * Returns 404 unless PAYMENTS_PROVIDER=mock and this is not production.
 */
export const POST = handler(async (req) => {
  const body = await req.json().catch(() => ({}));
  const result = await simulateMockPayment(await getActor(), body);
  for (const h of result.channelHandles) revalidateTag(`channel:${h.toLowerCase()}`, "max");
  return json({ ok: true, status: result.status, duplicate: result.duplicate, ignored: result.ignored });
});
