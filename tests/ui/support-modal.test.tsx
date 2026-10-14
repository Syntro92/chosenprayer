// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Channel } from "@/lib/channels";

const giving = vi.hoisted(() => ({
  getGivingConfigAction: vi.fn(),
  startDonationAction: vi.fn(),
  mockPayAction: vi.fn(),
  getDonationStatusAction: vi.fn(),
  createBlessingAction: vi.fn(),
}));
vi.mock("@/actions/giving", () => giving);
vi.mock("@/actions/follows", () => ({ followAction: vi.fn(), unfollowAction: vi.fn(), getFollowStateAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/components/ui/origin-button", () => ({
  OriginButton: ({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...p}>{children}</button>,
}));

const stripeForm = vi.hoisted(() => ({ props: null as null | { clientSecret: string; publishableKey: string; label: string } }));
vi.mock("@/components/channels/stripe-payment", () => ({
  StripePayment: (p: { clientSecret: string; publishableKey: string; label: string; onSubmitted: () => void; onBack: () => void }) => {
    stripeForm.props = p;
    return (
      <div data-testid="card-form">
        <button onClick={p.onSubmitted}>{p.label}</button>
        <button onClick={p.onBack}>Back from card</button>
      </div>
    );
  },
}));

import { SupportForm, SupportModal, type Support } from "@/components/channels/channel-profile";
import type { GivingConfig } from "@/server/services/giving";

const channel: Channel = {
  handle: "quietmornings",
  name: "Quiet Mornings",
  description: "Gentle practices",
  category: "Wellness",
  categorySlug: "wellness",
  followers: 100,
  supporters: 5,
  createdAt: "2025-01-01T00:00:00.000Z",
  cover: { tone: "sage", scene: "waves" },
};
const config: GivingConfig = { provider: "mock", testMode: true, publishableKey: null, available: true, recurring: true, minAmount: 1, maxAmount: 999_999 };
const once25: Support = { frequency: "once", amount: 25, custom: "" };

const ok = <T,>(data: T) => ({ ok: true as const, data });
const err = (code: string, message: string, fields?: Record<string, string>) => ({ ok: false as const, error: { code, message, fields } });
const started = (over = {}) => ok({ donationId: "d-1", token: "tok-secret-0123456789", provider: "mock", clientSecret: "s", status: "pending", amountCents: 2500, currency: "USD", frequency: "once", ...over });

function setup(over: Partial<{ signedIn: boolean; value: Support; config: GivingConfig | null; blessingsEnabled: boolean }> = {}) {
  const onBlessing = vi.fn();
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(
    <SupportModal
      channel={channel}
      value={over.value ?? once25}
      onChange={vi.fn()}
      onClose={onClose}
      onBlessing={onBlessing}
      blessingsEnabled={over.blessingsEnabled}
      config={over.config === undefined ? config : over.config}
      signedIn={over.signedIn ?? false}
    />,
  );
  return { user, onBlessing, onClose };
}
/** choose -> confirm */
const toConfirm = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: /^Support/ }));

beforeEach(() => {
  vi.clearAllMocks();
  giving.startDonationAction.mockResolvedValue(started());
  giving.mockPayAction.mockResolvedValue(ok({ status: "succeeded" }));
  giving.getDonationStatusAction.mockResolvedValue(ok({ status: "succeeded" }));
  giving.createBlessingAction.mockResolvedValue(ok({ id: "b-1", name: "Sarah", message: "Thank you", date: "2026-10-13" }));
});
afterEach(cleanup);

describe("SupportForm", () => {
  const renderForm = (cfg: GivingConfig | null, value = once25) => {
    const onContinue = vi.fn();
    render(<SupportForm channel={channel} value={value} onChange={vi.fn()} onContinue={onContinue} config={cfg} />);
    return onContinue;
  };

  it("lets you continue with a valid amount", async () => {
    const onContinue = renderForm(config);
    await userEvent.click(screen.getByRole("button", { name: /Support/ }));
    expect(onContinue).toHaveBeenCalled();
  });
  it("disables monthly giving when it's switched off", () => {
    renderForm({ ...config, recurring: false });
    expect(screen.getByRole("radio", { name: "Monthly" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "One-time" })).toBeEnabled();
  });
  it("shows a notice and blocks Continue while giving is paused", () => {
    renderForm({ ...config, available: false });
    expect(screen.getByRole("status")).toHaveTextContent("Giving is paused right now");
    expect(screen.getByRole("button", { name: /Support/ })).toBeDisabled();
  });
  it("blocks amounts above the maximum", () => {
    renderForm(config, { frequency: "once", amount: "custom", custom: "1000000" });
    expect(screen.getByRole("button", { name: /Support/ })).toBeDisabled();
  });
});

describe("SupportModal: confirm step", () => {
  it("asks guests for an email (name optional) and says it's test mode", async () => {
    const { user } = setup();
    await toConfirm(user);
    expect(screen.getByLabelText(/Email for your receipt/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Your name/)).toBeInTheDocument();
    expect(screen.getByText(/Test mode/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send $25" })).toBeInTheDocument();
  });
  it("doesn't ask signed-in members for anything", async () => {
    const { user } = setup({ signedIn: true });
    await toConfirm(user);
    expect(screen.queryByLabelText(/Email for your receipt/)).not.toBeInTheDocument();
  });
  it("labels monthly gifts", async () => {
    const { user } = setup({ value: { frequency: "monthly", amount: 25, custom: "" } });
    await toConfirm(user);
    expect(screen.getByRole("button", { name: "Send $25/mo" })).toBeInTheDocument();
  });
  it("doesn't mention test mode for a live provider", async () => {
    const { user } = setup({ config: { ...config, provider: "stripe", testMode: false, publishableKey: "pk_live_x" } });
    await toConfirm(user);
    expect(screen.queryByText(/Test mode/)).not.toBeInTheDocument();
  });
  it("a Stripe sandbox says test mode and shows the test card", async () => {
    const { user } = setup({ config: { ...config, provider: "stripe", testMode: true, publishableKey: "pk_test_x" } });
    await toConfirm(user);
    expect(screen.getByText(/Test mode/)).toBeInTheDocument();
    expect(screen.getByText(/4242 4242 4242 4242/)).toBeInTheDocument();
  });
  it("won't send a guest gift without an email, and never calls the server", async () => {
    const { user } = setup();
    await toConfirm(user);
    await user.click(screen.getByRole("button", { name: "Send $25" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter your email");
    expect(giving.startDonationAction).not.toHaveBeenCalled();
  });
});

describe("SupportModal: channel with blessings switched off", () => {
  it("thanks the donor but offers no message prompt", async () => {
    const { user } = setup({ signedIn: true, blessingsEnabled: false });
    await toConfirm(user);
    await user.click(screen.getByRole("button", { name: "Send $25" }));
    await screen.findByText("Your blessing has been sent.");
    expect(screen.getByText(/Thank you for supporting Quiet Mornings/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Leave a Blessing" })).not.toBeInTheDocument();
    expect(screen.queryByText(/leave a message/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });
  it("still offers it by default", async () => {
    const { user } = setup({ signedIn: true });
    await toConfirm(user);
    await user.click(screen.getByRole("button", { name: "Send $25" }));
    expect(await screen.findByRole("button", { name: "Leave a Blessing" })).toBeInTheDocument();
  });
});

describe("SupportModal: paying", () => {
  async function payAsGuest(user: ReturnType<typeof userEvent.setup>, email = "  sarah@example.com ", name = "Sarah") {
    await toConfirm(user);
    await user.type(screen.getByLabelText(/Email for your receipt/), email);
    if (name) await user.type(screen.getByLabelText(/Your name/), name);
    await user.click(screen.getByRole("button", { name: "Send $25" }));
  }

  it("start -> simulated payment -> confirmed -> thank-you screen", async () => {
    const { user } = setup();
    await payAsGuest(user);
    expect(await screen.findByText("Your blessing has been sent.")).toBeInTheDocument();

    expect(giving.startDonationAction).toHaveBeenCalledTimes(1);
    const arg = giving.startDonationAction.mock.calls[0][0];
    expect(arg).toMatchObject({ channelHandle: "quietmornings", amount: 25, frequency: "once", donorEmail: "sarah@example.com", donorName: "Sarah" });
    expect(arg.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(giving.mockPayAction).toHaveBeenCalledWith({ donationId: "d-1", token: "tok-secret-0123456789", outcome: "succeeded" });
    expect(giving.getDonationStatusAction).toHaveBeenCalledWith({ donationId: "d-1", token: "tok-secret-0123456789" });
  });

  it("signed-in members send no email or name (the server uses their account)", async () => {
    const { user } = setup({ signedIn: true });
    await toConfirm(user);
    await user.click(screen.getByRole("button", { name: "Send $25" }));
    await screen.findByText("Your blessing has been sent.");
    const arg = giving.startDonationAction.mock.calls[0][0];
    expect(arg.donorEmail).toBeUndefined();
    expect(arg.donorName).toBeUndefined();
  });

  const stripeConfig = { ...config, provider: "stripe" as const, testMode: true, publishableKey: "pk_test_x" };

  it("with Stripe it never fakes a payment: it opens the card form for the payment", async () => {
    giving.startDonationAction.mockResolvedValue(started({ provider: "stripe", clientSecret: "pi_1_secret_abc" }));
    const { user } = setup({ signedIn: true, config: stripeConfig });
    await toConfirm(user);
    await user.click(screen.getByRole("button", { name: "Send $25" }));
    await screen.findByTestId("card-form");
    expect(giving.mockPayAction).not.toHaveBeenCalled();
    expect(giving.getDonationStatusAction).not.toHaveBeenCalled(); // nothing to wait for until the card is submitted
    expect(stripeForm.props).toMatchObject({ clientSecret: "pi_1_secret_abc", publishableKey: "pk_test_x", label: "Pay $25" });
  });

  it("monthly Stripe gifts say so on the card form", async () => {
    giving.startDonationAction.mockResolvedValue(started({ provider: "stripe", frequency: "monthly", clientSecret: "sec" }));
    const { user } = setup({ signedIn: true, config: stripeConfig, value: { frequency: "monthly", amount: 25, custom: "" } });
    await toConfirm(user);
    await user.click(screen.getByRole("button", { name: "Send $25/mo" }));
    await screen.findByTestId("card-form");
    expect(screen.getByText(/every month/)).toBeInTheDocument();
    expect(stripeForm.props?.label).toBe("Pay $25/mo");
  });

  it("after the card is accepted it waits for the webhook-confirmed status, then shows the thank-you", async () => {
    giving.startDonationAction.mockResolvedValue(started({ provider: "stripe", clientSecret: "sec" }));
    giving.getDonationStatusAction.mockResolvedValue(ok({ status: "succeeded" }));
    const { user } = setup({ signedIn: true, config: stripeConfig });
    await toConfirm(user);
    await user.click(screen.getByRole("button", { name: "Send $25" }));
    await user.click(await screen.findByRole("button", { name: "Pay $25" }));
    await screen.findByText("Your blessing has been sent.");
    expect(giving.getDonationStatusAction).toHaveBeenCalledWith({ donationId: "d-1", token: "tok-secret-0123456789" });
    expect(giving.mockPayAction).not.toHaveBeenCalled();
  });

  it("if the confirmation says the payment failed, it tells the donor and lets them check again", async () => {
    giving.startDonationAction.mockResolvedValue(started({ provider: "stripe", clientSecret: "sec" }));
    giving.getDonationStatusAction.mockResolvedValue(ok({ status: "failed" }));
    const { user } = setup({ signedIn: true, config: stripeConfig });
    await toConfirm(user);
    await user.click(screen.getByRole("button", { name: "Send $25" }));
    await user.click(await screen.findByRole("button", { name: "Pay $25" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("didn't go through");
    expect(screen.getByRole("button", { name: "Check again" })).toBeEnabled();
  });

  it("Back from the card form returns to the amount step", async () => {
    giving.startDonationAction.mockResolvedValue(started({ provider: "stripe", clientSecret: "sec" }));
    const { user } = setup({ signedIn: true, config: stripeConfig });
    await toConfirm(user);
    await user.click(screen.getByRole("button", { name: "Send $25" }));
    await user.click(await screen.findByRole("button", { name: "Back from card" }));
    expect(screen.getByRole("button", { name: /^Support/ })).toBeInTheDocument();
    expect(screen.queryByTestId("card-form")).not.toBeInTheDocument();
  });

  it("Stripe without a publishable key or client secret shows an error instead of a broken form", async () => {
    giving.startDonationAction.mockResolvedValue(started({ provider: "stripe", clientSecret: "sec" }));
    const { user } = setup({ signedIn: true, config: { ...stripeConfig, publishableKey: null } });
    await toConfirm(user);
    await user.click(screen.getByRole("button", { name: "Send $25" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Payments aren't available");
    expect(screen.queryByTestId("card-form")).not.toBeInTheDocument();
  });

  it("an already-settled donation (a retried request) goes straight to the thank-you screen", async () => {
    giving.startDonationAction.mockResolvedValue(started({ status: "succeeded", clientSecret: null }));
    const { user } = setup({ signedIn: true });
    await toConfirm(user);
    await user.click(screen.getByRole("button", { name: "Send $25" }));
    await screen.findByText("Your blessing has been sent.");
    expect(giving.mockPayAction).not.toHaveBeenCalled();
    expect(giving.getDonationStatusAction).not.toHaveBeenCalled();
  });

  it("shows the server's message and the email field error when starting fails", async () => {
    giving.startDonationAction.mockResolvedValue(err("VALIDATION", "Enter your email so we can send a receipt.", { donorEmail: "Enter your email for the receipt" }));
    const { user } = setup();
    await payAsGuest(user, "x@example.com");
    expect(await screen.findByText("Enter your email so we can send a receipt.")).toBeInTheDocument();
    expect(screen.getAllByRole("alert").some((a) => a.textContent === "Enter your email for the receipt")).toBe(true);
    expect(screen.queryByText("Your blessing has been sent.")).not.toBeInTheDocument();
  });

  it("when giving is paused or the provider is down, you're told clearly and nothing is marked paid", async () => {
    giving.startDonationAction.mockResolvedValue(err("UNAVAILABLE", "Giving is paused right now. Please check back soon."));
    const { user } = setup({ signedIn: true });
    await toConfirm(user);
    await user.click(screen.getByRole("button", { name: "Send $25" }));
    expect(await screen.findByText("Giving is paused right now. Please check back soon.")).toBeInTheDocument();
    expect(giving.mockPayAction).not.toHaveBeenCalled();
  });

  it("a network blow-up says you haven't been charged and lets you retry", async () => {
    giving.startDonationAction.mockRejectedValue(new Error("network"));
    const { user } = setup({ signedIn: true });
    await toConfirm(user);
    await user.click(screen.getByRole("button", { name: "Send $25" }));
    expect(await screen.findByText(/You haven't been charged/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send $25" })).toBeEnabled();
  });

  it("retrying the SAME attempt reuses the idempotency key (a retry can never charge twice)", async () => {
    giving.startDonationAction.mockRejectedValueOnce(new Error("timeout")).mockResolvedValue(started());
    const { user } = setup({ signedIn: true });
    await toConfirm(user);
    await user.click(screen.getByRole("button", { name: "Send $25" }));
    await screen.findByText(/You haven't been charged/);
    await user.click(screen.getByRole("button", { name: "Send $25" }));
    await screen.findByText("Your blessing has been sent.");
    const [a, b] = giving.startDonationAction.mock.calls.map((c) => c[0].idempotencyKey);
    expect(a).toBe(b);
  });

  it("after a DECLINED payment the next try uses a fresh key (a failed payment can't be reused)", async () => {
    giving.getDonationStatusAction.mockResolvedValueOnce(ok({ status: "failed" })).mockResolvedValue(ok({ status: "succeeded" }));
    const { user } = setup({ signedIn: true });
    await toConfirm(user);
    await user.click(screen.getByRole("button", { name: "Send $25" }));
    expect(await screen.findByText(/payment didn't go through/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send $25" }));
    await screen.findByText("Your blessing has been sent.");
    const [a, b] = giving.startDonationAction.mock.calls.map((c) => c[0].idempotencyKey);
    expect(a).not.toBe(b);
  });

  it("going Back and returning starts a new attempt (new key)", async () => {
    giving.startDonationAction.mockResolvedValue(err("VALIDATION", "nope"));
    const { user } = setup({ signedIn: true });
    await toConfirm(user);
    await user.click(screen.getByRole("button", { name: "Send $25" }));
    await screen.findByText("nope");
    await user.click(screen.getByRole("button", { name: "Back" }));
    await toConfirm(user);
    await user.click(screen.getByRole("button", { name: "Send $25" }));
    await waitFor(() => expect(giving.startDonationAction).toHaveBeenCalledTimes(2));
    const [a, b] = giving.startDonationAction.mock.calls.map((c) => c[0].idempotencyKey);
    expect(a).not.toBe(b);
  });

  it("can't be double-submitted while a payment is in flight", async () => {
    let release: (v: unknown) => void = () => {};
    giving.startDonationAction.mockReturnValue(new Promise((r) => (release = r)));
    const { user } = setup({ signedIn: true });
    await toConfirm(user);
    const send = screen.getByRole("button", { name: "Send $25" });
    await user.click(send);
    await user.click(screen.getByRole("button", { name: "Sending…" }));
    expect(giving.startDonationAction).toHaveBeenCalledTimes(1);
    release(started());
    await screen.findByText("Your blessing has been sent.");
  });
});

describe("SupportModal: blessing", () => {
  async function paidAndWriting(signedIn: boolean, guestName = "") {
    const ctx = setup({ signedIn });
    await toConfirm(ctx.user);
    if (!signedIn) {
      await ctx.user.type(screen.getByLabelText(/Email for your receipt/), "g@example.com");
      if (guestName) await ctx.user.type(screen.getByLabelText(/Your name/), guestName);
    }
    await ctx.user.click(screen.getByRole("button", { name: "Send $25" }));
    await screen.findByText("Your blessing has been sent.");
    await ctx.user.click(screen.getByRole("button", { name: "Leave a Blessing" }));
    return ctx;
  }

  it("sends the message with the supporter's privacy choices and reports the new blessing", async () => {
    const { user, onBlessing } = await paidAndWriting(true);
    await user.type(screen.getByLabelText("Your message"), "  Keep going!  ");
    await user.click(screen.getByLabelText("Show my name")); // uncheck: stay anonymous
    await user.click(screen.getByLabelText("Show how much I gave"));
    await user.click(screen.getByRole("button", { name: "Share Blessing" }));

    expect(giving.createBlessingAction).toHaveBeenCalledWith({
      donationId: "d-1",
      token: "tok-secret-0123456789",
      message: "Keep going!",
      anonymous: true,
      showAmount: true,
      displayName: undefined,
    });
    expect(await screen.findByText(/shared on this channel/)).toBeInTheDocument();
    expect(onBlessing).toHaveBeenCalledWith({ id: "b-1", name: "Sarah", message: "Thank you", date: "2026-10-13" });
  });

  it("defaults to showing the name and hiding the amount", async () => {
    const { user } = await paidAndWriting(true);
    await user.type(screen.getByLabelText("Your message"), "Hello");
    await user.click(screen.getByRole("button", { name: "Share Blessing" }));
    expect(giving.createBlessingAction.mock.calls[0][0]).toMatchObject({ anonymous: false, showAmount: false });
  });

  it("a guest who gave a name can show it; one who didn't isn't offered the choice", async () => {
    const named = await paidAndWriting(false, "Sarah");
    expect(screen.getByLabelText("Show my name")).toBeInTheDocument();
    await named.user.type(screen.getByLabelText("Your message"), "Hi");
    await named.user.click(screen.getByRole("button", { name: "Share Blessing" }));
    expect(giving.createBlessingAction.mock.calls[0][0]).toMatchObject({ displayName: "Sarah", anonymous: false });
    cleanup();

    await paidAndWriting(false, "");
    expect(screen.queryByLabelText("Show my name")).not.toBeInTheDocument();
  });

  it("won't send an empty message, and shows server errors without losing the text", async () => {
    giving.createBlessingAction.mockResolvedValue(err("CONFLICT", "You've already left a blessing for this gift."));
    const { user } = await paidAndWriting(true);
    await user.click(screen.getByRole("button", { name: "Share Blessing" }));
    expect(giving.createBlessingAction).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Your message"), "Thanks");
    await user.click(screen.getByRole("button", { name: "Share Blessing" }));
    expect(await screen.findByText("You've already left a blessing for this gift.")).toBeInTheDocument();
    expect(screen.getByLabelText("Your message")).toHaveValue("Thanks");
  });
});
