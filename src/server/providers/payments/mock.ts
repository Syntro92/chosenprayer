import "server-only";
import { randomUUID } from "node:crypto";
import type { PaymentProvider } from "./types";

/**
 * Test-mode provider: no money moves and nothing leaves the server. A payment only
 * "completes" when simulateMockPayment feeds an event through the real handler, which is
 * exactly the path a verified Stripe webhook will use.
 */
export const mockPayments: PaymentProvider = {
  name: "mock",

  async createCheckout(p) {
    return {
      providerPaymentId: `mock_pi_${randomUUID()}`,
      clientSecret: `mock_secret_${randomUUID()}`,
      providerCustomerId: `mock_cus_${randomUUID().slice(0, 12)}`,
      ...(p.frequency === "monthly" ? { providerSubscriptionId: `mock_sub_${randomUUID()}` } : {}),
    };
  },

  async resumeCheckout(providerPaymentId) {
    return { clientSecret: `mock_secret_${providerPaymentId.replace(/^mock_pi_/, "")}` };
  },

  async cancelSubscription() {
    // nothing to cancel on the provider side
  },

  async refund(providerPaymentId) {
    return { refundId: `mock_re_${providerPaymentId.replace(/^mock_pi_/, "").slice(0, 12)}_${randomUUID().slice(0, 6)}` };
  },
};
