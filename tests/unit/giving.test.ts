import { describe, expect, it } from "vitest";
import { formatMoney } from "@/lib/giving";
import { blessingSchema, startDonationSchema } from "@/lib/schemas/giving";
import { requireCronSecret } from "@/server/cron";
import { getEnv } from "@/server/env";
import { consoleSender, maskEmail } from "@/server/providers/email";
import { getPaymentProvider } from "@/server/providers/payments";
import { mockPayments } from "@/server/providers/payments/mock";
import { escapeHtml, renderEmail } from "@/server/services/email-templates";

describe("formatMoney", () => {
  it("shows whole amounts without cents and fractional ones with", () => {
    expect(formatMoney(2500)).toBe("$25");
    expect(formatMoney(2550)).toBe("$25.50");
    expect(formatMoney(100_000_00)).toBe("$100,000");
    expect(formatMoney(1500, "EUR")).toBe("€15");
  });
});

describe("startDonationSchema", () => {
  const ok = { channelHandle: "noblesoul111", amount: 25, idempotencyKey: "key-12345678" };
  it("accepts a valid gift and fills in defaults", () => {
    expect(startDonationSchema.parse(ok)).toMatchObject({ amount: 25, frequency: "once", source: "web" });
  });
  it("coerces numeric strings (form posts) but rejects fractions and out-of-range amounts", () => {
    expect(startDonationSchema.parse({ ...ok, amount: "40" }).amount).toBe(40);
    for (const amount of [0, -1, 1.5, 1_000_000, "abc", ""]) expect(startDonationSchema.safeParse({ ...ok, amount }).success).toBe(false);
    expect(startDonationSchema.safeParse({ ...ok, amount: 999_999 }).success).toBe(true);
  });
  it("normalises the handle and email, and refuses bad ones", () => {
    const r = startDonationSchema.parse({ ...ok, channelHandle: "  NobleSoul111 ", donorEmail: "  Me@Example.COM " });
    expect(r.channelHandle).toBe("noblesoul111");
    expect(r.donorEmail).toBe("me@example.com");
    expect(startDonationSchema.safeParse({ ...ok, channelHandle: "../etc" }).success).toBe(false);
    expect(startDonationSchema.safeParse({ ...ok, donorEmail: "nope" }).success).toBe(false);
  });
  it("needs a real idempotency key and a known source/frequency", () => {
    expect(startDonationSchema.safeParse({ ...ok, idempotencyKey: "short" }).success).toBe(false);
    expect(startDonationSchema.safeParse({ ...ok, frequency: "yearly" }).success).toBe(false);
    expect(startDonationSchema.safeParse({ ...ok, source: "carrier-pigeon" }).success).toBe(false);
  });
});

describe("blessingSchema", () => {
  const ok = { donationId: "3b5c274b-6f62-4afd-9476-ca2c32b9bd29", message: "Thank you" };
  it("trims, defaults the flags, and enforces length", () => {
    expect(blessingSchema.parse({ ...ok, message: "  Hi  " })).toMatchObject({ message: "Hi", anonymous: false, showAmount: false });
    expect(blessingSchema.safeParse({ ...ok, message: "   " }).success).toBe(false);
    expect(blessingSchema.safeParse({ ...ok, message: "x".repeat(501) }).success).toBe(false);
    expect(blessingSchema.safeParse({ ...ok, donationId: "nope" }).success).toBe(false);
  });
});

describe("email templates", () => {
  const base = { channelName: "Quiet Mornings", amountCents: 2500, currency: "USD", donationId: "abcdef12-0000-0000-0000-000000000000", paidAt: "2026-10-13T10:00:00Z" };

  it("renders a one-time receipt", () => {
    const m = renderEmail("donation_receipt", { ...base, frequency: "once" });
    expect(m.subject).toBe("Thank you for supporting Quiet Mornings");
    expect(m.text).toContain("Amount: $25");
    expect(m.text).toContain("Reference: ABCDEF12");
    expect(m.text).toContain("2026-10-13");
    expect(m.text).toContain("one-time");
    expect(m.html).toContain("Quiet Mornings");
  });
  it("renders a monthly receipt that explains how to stop", () => {
    const m = renderEmail("donation_receipt", { ...base, frequency: "monthly" });
    expect(m.text).toContain("$25 / month");
    expect(m.text).toContain("until you cancel it");
    const withLink = renderEmail("donation_receipt", { ...base, frequency: "monthly", cancelUrl: "https://x.test/subscription/cancel?token=a.b" });
    expect(withLink.html).toContain("Cancel monthly support");
    expect(withLink.text).toContain("https://x.test/subscription/cancel?token=a.b");
    expect(renderEmail("donation_receipt", { ...base, cancelUrl: "https://x.test/c" }).html).not.toContain("Cancel monthly support");
  });
  it("renders refund and cancellation notices", () => {
    expect(renderEmail("donation_refunded", base).subject).toContain("refunded");
    expect(renderEmail("subscription_canceled", base).text).toContain("will not be charged again");
  });
  it("escapes anything interpolated into HTML (a channel name can't inject markup)", () => {
    const m = renderEmail("donation_receipt", { ...base, channelName: `<script>alert("x")</script> & co`, frequency: "once" });
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.html).toContain("&amp; co");
    expect(escapeHtml(`a<b>"c"'d'&`)).toBe("a&lt;b&gt;&quot;c&quot;&#39;d&#39;&amp;");
  });
  it("copes with missing payload fields and rejects unknown templates", () => {
    expect(() => renderEmail("donation_receipt", {})).not.toThrow();
    expect(() => renderEmail("mystery", {})).toThrow(/Unknown email template/);
  });
});

describe("email sender", () => {
  it("masks addresses for logs", () => {
    expect(maskEmail("jane.doe@example.com")).toBe("j***@example.com");
  });
  it("the console sender just resolves (nothing is sent)", async () => {
    await expect(consoleSender.send({ to: "a@example.com", subject: "s", text: "t", html: "<p>t</p>" })).resolves.toBeUndefined();
  });
});

describe("mock payment provider", () => {
  it("issues unique references, and subscription ids only for monthly gifts", async () => {
    const params = { donationId: "d", channel: { id: "c", handle: "h", name: "n", stripeAccountId: null }, amountCents: 100, currency: "USD", donorEmail: null, description: "x" };
    const a = await mockPayments.createCheckout({ ...params, frequency: "once" });
    const b = await mockPayments.createCheckout({ ...params, frequency: "monthly" });
    expect(a.providerPaymentId).toMatch(/^mock_pi_/);
    expect(a.providerPaymentId).not.toBe(b.providerPaymentId);
    expect(a.providerSubscriptionId).toBeUndefined();
    expect(b.providerSubscriptionId).toMatch(/^mock_sub_/);
    expect((await mockPayments.resumeCheckout(a.providerPaymentId)).clientSecret).toMatch(/^mock_secret_/);
    expect((await mockPayments.refund(a.providerPaymentId)).refundId).toMatch(/^mock_re_/);
  });
  it("is the configured provider in development, but refuses to run in production", () => {
    expect(getPaymentProvider().name).toBe("mock");
    const env = getEnv() as { NODE_ENV: string };
    const saved = env.NODE_ENV;
    try {
      env.NODE_ENV = "production";
      expect(() => getPaymentProvider()).toThrowError(expect.objectContaining({ code: "UNAVAILABLE" }));
    } finally {
      env.NODE_ENV = saved;
    }
  });
});

describe("requireCronSecret", () => {
  const secret = () => getEnv().CRON_SECRET;
  const req = (auth?: string) => new Request("http://x/api/cron/email", { headers: auth ? { authorization: auth } : {} });
  it("accepts the right bearer token", () => {
    expect(() => requireCronSecret(req(`Bearer ${secret()}`))).not.toThrow();
  });
  it.each([
    ["no header", undefined],
    ["wrong token", "Bearer nope"],
    ["wrong scheme", "Basic abc"],
    ["bare secret", "SECRETVALUE"],
    ["empty bearer", "Bearer "],
  ])("rejects %s", (_n, header) => {
    const h = header === "SECRETVALUE" ? secret() : header;
    expect(() => requireCronSecret(req(h))).toThrowError(expect.objectContaining({ code: "UNAUTHENTICATED" }));
  });
  it("rejects a token that merely starts with the secret", () => {
    expect(() => requireCronSecret(req(`Bearer ${secret()}x`))).toThrow();
  });
});

describe("account emails", () => {
  it("renders every account template without secrets or unescaped input", () => {
    for (const t of ["account_created", "account_suspended", "account_reinstated", "role_changed", "password_changed", "account_deleted"]) {
      const m = renderEmail(t, { name: "<b>Sam</b>", role: "admin", reason: "<i>spam</i>", loginUrl: "https://x.test/signin" });
      expect(m.subject).toBeTruthy();
      expect(m.html).not.toContain("<b>Sam</b>");
      expect(m.html).not.toContain("<i>spam</i>");
      expect(m.text).not.toMatch(/password:/i);
    }
  });
  it("welcome email links to sign-in", () => {
    expect(renderEmail("account_created", { name: "Sam", role: "admin", loginUrl: "https://x.test/signin" }).html).toContain('href="https://x.test/signin"');
  });
});
