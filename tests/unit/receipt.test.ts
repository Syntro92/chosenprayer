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

  it("has a 'Download Stripe receipt' button and text link when Stripe supplied one", () => {
    const m = renderEmail("donation_receipt", { ...base, receiptUrl: URL_OK });
    expect(m.html).toContain(`href="${URL_OK}"`);
    expect(m.html).toContain("Download Stripe receipt");
    expect(m.text).toContain(`Download your receipt: ${URL_OK}`);
  });

  it("works exactly as before without a link (mock provider, older receipts)", () => {
    const m = renderEmail("donation_receipt", base);
    expect(m.html).not.toContain("Download Stripe receipt");
    expect(m.text).not.toContain("Download your receipt");
    expect(m.html).toContain("Thank you for supporting Everyday Grace");
  });

  it("ignores a link that is not a Stripe page", () => {
    const m = renderEmail("donation_receipt", { ...base, receiptUrl: "https://evil.example/phish" });
    expect(m.html).not.toContain("evil.example");
    expect(m.text).not.toContain("evil.example");
  });

  it("escapes the link when it is placed in the HTML", () => {
    const m = renderEmail("donation_receipt", { ...base, receiptUrl: 'https://pay.stripe.com/x?a=1&b="2"' });
    expect(m.html).not.toContain('b="2"');
    expect(m.html).toContain("&amp;");
  });

  it("monthly receipts get the button too", () => {
    const m = renderEmail("donation_receipt", { ...base, frequency: "monthly", receiptUrl: URL_OK });
    expect(m.html).toContain("Download Stripe receipt");
    expect(m.html).toContain("/ month");
  });
});
