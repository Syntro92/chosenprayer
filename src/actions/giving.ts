"use server";

import { headers } from "next/headers";
import { revalidateTag } from "next/cache";
import { action } from "@/server/action";
import { getActor } from "@/server/auth/session";
import { ipFromHeaders } from "@/server/http";
import { errorFields, log } from "@/server/logger";
import { getPaymentsMode, getStripeClient } from "@/server/providers/payments";
import { createBlessing } from "@/server/services/blessings";
import { reconcileStripeDonation } from "@/server/services/stripe-webhook";
import {
  cancelMySubscription,
  cancelSubscriptionByToken,
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
  return action("getDonationStatus", async () => {
    const actor = await getActor();
    // If Stripe's webhook hasn't landed yet, confirm with Stripe directly so the donor isn't left waiting.
    if (getPaymentsMode().provider === "stripe") {
      try {
        refresh(await reconcileStripeDonation(actor, input, getStripeClient()));
      } catch (e) {
        log.warn("could not reconcile donation with Stripe; relying on the webhook", errorFields(e));
      }
    }
    return getDonationStatus(actor, input);
  });
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

/** The "Cancel monthly support" button in the payment email: the signed token is the authorization. */
export async function cancelSubscriptionByTokenAction(token: string) {
  return action("cancelSubscriptionByToken", async () => cancelSubscriptionByToken(token));
}
