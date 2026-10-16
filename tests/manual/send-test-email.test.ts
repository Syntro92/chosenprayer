import { describe, it } from "vitest";
import { renderEmail } from "@/server/services/email-templates";
import { getEmailSender } from "@/server/providers/email";

// Manual only: `npm run email:test -- you@example.com [template]`. Skipped unless SEND_TEST_TO is set.
describe.skipIf(!process.env.SEND_TEST_TO)("send a real test email", () => {
  it("sends the chosen template", async () => {
    const m = renderEmail(process.env.SEND_TEST_TEMPLATE ?? "donation_receipt", {
      name: "Bwave",
      role: "admin",
      reason: "Repeated spam in the community feed",
      loginUrl: `${process.env.APP_URL}/signin`,
      channelName: "Chosen Prayer Fund",
      amountCents: 2500,
      currency: "USD",
      frequency: "monthly",
      paidAt: new Date().toISOString(),
      donationId: "a1b2c3d4-0000-0000-0000-000000000000",
    });
    const sender = getEmailSender();
    await sender.send({ to: process.env.SEND_TEST_TO!, ...m });
    console.log(`sent via ${sender.name} to ${process.env.SEND_TEST_TO}`);
  });
});
