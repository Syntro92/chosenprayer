import { describe, expect, it } from "vitest";
import { safeReceiptUrl } from "@/lib/giving";
import { renderEmail } from "@/server/services/email-templates";

const URL_OK = "https://pay.stripe.com/receipts/payment/CAcaFwoVYWNjdF8xVVAwQ2pQVVVWVHoyUGZEKJ";

describe("safeReceiptUrl", () => {
  it("accepts https pages on stripe.com", () => {
    expect(safeReceiptUrl(URL_OK)).toBe(URL_OK);
    expect(safeReceiptUrl("https://dashboard.stripe.com/receipts/x")).toContain("dashboard.stripe.com");
    expect(safeReceiptUrl("https://stripe.com/receipt")).toBe("https://stripe.com/receipt");
  });
  it("refuses everything else, so a bad value can never become a link in an email", () => {
    for (const bad of [
      "http://pay.stripe.com/x",
      "https://evil.example/receipt",
      "https://stripe.com.evil.example/x",
      "https://notstripe.com/x",
      "https://evilstripe.com/x",
      "javascript:alert(1)",
      "//pay.stripe.com/x",
      "pay.stripe.com/x",
      "",
      null,
      undefined,
      42,
      "https://pay.stripe.com/" + "a".repeat(600),
    ]) {
      expect(safeReceiptUrl(bad)).toBeNull();
    }
  });
});

describe("receipt email", () => {
  const base = { donationId: "7945dc25-aaaa-bbbb-cccc-111122223333", channelName: "Everyday Grace", amountCents: 2000, currency: "USD", frequency: "once", paidAt: "2026-10-14T08:00:00Z" };

  it("has no Stripe receipt button or link, even when Stripe supplied one", () => {
    const m = renderEmail("donation_receipt", { ...base, receiptUrl: URL_OK });
    expect(m.html).not.toContain(URL_OK);
    expect(m.html).not.toContain("Download Stripe receipt");
    expect(m.text).not.toContain(URL_OK);
    expect(m.text).not.toContain("Download your receipt");
    expect(m.html).toContain("Thank you for supporting Everyday Grace");
  });

  it("monthly receipts show the monthly amount", () => {
    const m = renderEmail("donation_receipt", { ...base, frequency: "monthly" });
    expect(m.html).toContain("/ month");
  });
});
