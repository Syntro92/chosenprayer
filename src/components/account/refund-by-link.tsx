"use client";

import Link from "next/link";
import { useState } from "react";
import { refundByTokenAction } from "@/actions/giving";

const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-charcoal-deep focus-visible:ring-offset-2";

export function RefundByLink({ token, channelName, amount }: { token: string; channelName: string; amount: string }) {
  const [state, setState] = useState<"ask" | "busy" | "done">("ask");
  const [error, setError] = useState("");

  async function refund() {
    setState("busy");
    setError("");
    const r = await refundByTokenAction(token);
    if (!r.ok) {
      setError(r.error.message);
      return setState("ask");
    }
    setState("done");
  }

  if (state === "done") {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight text-charcoal-deep">Your gift has been refunded</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate">
          {amount} is on its way back to the card you paid with. Depending on your bank it can take a few days to
          appear. We&apos;ve sent you a confirmation email.
        </p>
        <Link href="/channels" className={`mt-6 inline-flex h-11 items-center rounded-xl bg-charcoal-deep px-5 text-sm font-semibold text-white ${focus}`}>
          Explore channels
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-charcoal-deep">Request a refund?</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate">
        Your gift of <strong className="text-charcoal-deep">{amount}</strong> to{" "}
        <strong className="text-charcoal-deep">{channelName}</strong> will be refunded to the payment method you used.
        If this was a monthly gift, cancel it separately so you aren&apos;t charged again.
      </p>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={refund}
          disabled={state === "busy"}
          className={`h-11 rounded-xl bg-red-700 px-5 text-sm font-semibold text-white transition hover:bg-red-800 disabled:opacity-60 ${focus}`}
        >
          {state === "busy" ? "Refunding…" : "Yes, refund my gift"}
        </button>
        <Link href="/" className={`inline-flex h-11 items-center rounded-xl border border-line px-5 text-sm font-semibold text-charcoal-deep ${focus}`}>
          Keep my gift
        </Link>
      </div>
    </>
  );
}
