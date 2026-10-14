"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useState } from "react";
import { OriginButton } from "@/components/ui/origin-button";

// One Stripe.js instance per publishable key, loaded on first use (never on pages that don't take payments).
const loaded = new Map<string, Promise<Stripe | null>>();
const stripeFor = (key: string) => {
  let p = loaded.get(key);
  if (!p) loaded.set(key, (p = loadStripe(key)));
  return p;
};

interface Props {
  publishableKey: string;
  clientSecret: string;
  /** e.g. "Pay $25/mo" */
  label: string;
  /** Stripe accepted the payment (or is processing it). Our own confirmation arrives via webhook. */
  onSubmitted: () => void;
  onBack: () => void;
  busy: boolean;
}

/** Stripe's card form for one payment. Cards never touch our servers: they go from this iframe to Stripe. */
export function StripePayment(props: Props) {
  return (
    <Elements
      stripe={stripeFor(props.publishableKey)}
      options={{
        clientSecret: props.clientSecret,
        appearance: { theme: "stripe", variables: { colorPrimary: "#171918", borderRadius: "12px", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" } },
      }}
    >
      <Form {...props} />
    </Elements>
  );
}

function Form({ label, onSubmitted, onBack, busy }: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || submitting) return;
    setSubmitting(true);
    setError("");
    const result = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: { return_url: window.location.href },
    });
    setSubmitting(false);
    if (result.error) {
      // Declines and validation problems: the donor can fix the card and try again on the same payment.
      setError(result.error.message ?? "Your payment didn't go through. Please check your details and try again.");
      return;
    }
    onSubmitted();
  }

  const working = submitting || busy;
  return (
    <form onSubmit={submit} className="mt-6">
      {/* Cards (incl. Apple/Google Pay) only: no Link account prompts or Link-powered bank / pay-later options. */}
      <PaymentElement options={{ wallets: { link: "never" } }} />
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}
      <OriginButton type="submit" disabled={!stripe || working} className="mt-5 w-full">
        {working ? "Processing…" : label}
      </OriginButton>
      <button
        type="button"
        onClick={onBack}
        disabled={working}
        className="mt-2 h-10 w-full rounded-xl text-sm font-medium text-slate transition hover:text-charcoal-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-charcoal-deep focus-visible:ring-offset-2"
      >
        Back
      </button>
    </form>
  );
}
