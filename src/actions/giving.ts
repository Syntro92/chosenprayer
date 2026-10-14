"use server";

import { headers } from "next/headers";
import { revalidateTag } from "next/cache";
import { action } from "@/server/action";
import { getActor } from "@/server/auth/session";
import { ipFromHeaders } from "@/server/http";
import { createBlessing } from "@/server/services/blessings";
import {
  cancelMySubscription,
  getDonationStatus,
  getGivingConfig,
  simulateMockPayment,
  startDonation,
} from "@/server/services/giving";

// Thin adapters over src/server/services/giving.ts and blessings.ts (all rules live there).

const refresh = (handles: string[]) => {
  for (const h of handles) revalidateTag(`channel:${h.toLowerCase()}`, "max");
};

/** What the support form needs to know: is giving on, is monthly allowed, is this test mode. */
export async function getGivingConfigAction() {
  return action("getGivingConfig", async () => getGivingConfig());
}

export async function startDonationAction(input: unknown) {
  return action("startDonation", async () =>
    startDonation(await getActor(), input, { ip: ipFromHeaders(await headers()) }),
  );
}

/** TEST MODE ONLY: completes a pending donation through the real event handler. 404 in production. */
export async function mockPayAction(input: unknown) {
  return action("mockPay", async () => {
    const r = await simulateMockPayment(await getActor(), input);
    refresh(r.channelHandles);
    return { status: r.status };
  });
}

export async function getDonationStatusAction(input: unknown) {
  return action("getDonationStatus", async () => getDonationStatus(await getActor(), input));
}

export async function createBlessingAction(input: unknown) {
  return action("createBlessing", async () => {
    const { channelHandle, ...blessing } = await createBlessing(await getActor(), input);
    refresh([channelHandle]);
    return blessing;
  });
}

export async function cancelSubscriptionAction(subscriptionId: string) {
  return action("cancelSubscription", async () => cancelMySubscription(await getActor(), subscriptionId));
}
