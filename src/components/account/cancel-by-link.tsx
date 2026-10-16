"use client";

import Link from "next/link";
import { useState } from "react";
import { cancelSubscriptionByTokenAction } from "@/actions/giving";

const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-charcoal-deep focus-visible:ring-offset-2";

export function CancelByLink({ token, channelName, amount }: { token: string; channelName: string; amount: string }) {
  const [state, setState] = useState<"ask" | "busy" | "done">("ask");
  const [error, setError] = useState("");

  async function cancel() {
    setState("busy");
    setError("");
    const r = await cancelSubscriptionByTokenAction(token);
    if (!r.ok) {
      setError(r.error.message);
      return setState("ask");
    }
    setState("done");
  }

  if (state === "done") {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight text-charcoal-deep">Your monthly support has ended</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate">
          You will not be charged again for {channelName}. We&apos;ve sent you a confirmation email. Thank you for your support.
        </p>
        <Link href="/channels" className={`mt-6 inline-flex h-11 items-center rounded-xl bg-charcoal-deep px-5 text-sm font-semibold text-white ${focus}`}>
          Explore channels
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-charcoal-deep">Cancel monthly support?</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate">
        You&apos;re supporting <strong className="text-charcoal-deep">{channelName}</strong> with{" "}
        <strong className="text-charcoal-deep">{amount} / month</strong>. If you cancel, you won&apos;t be charged again.
      </p>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={cancel}
          disabled={state === "busy"}
          className={`h-11 rounded-xl bg-red-700 px-5 text-sm font-semibold text-white transition hover:bg-red-800 disabled:opacity-60 ${focus}`}
        >
          {state === "busy" ? "Canceling…" : "Yes, cancel"}
        </button>
        <Link href="/" className={`inline-flex h-11 items-center rounded-xl border border-line px-5 text-sm font-semibold text-charcoal-deep ${focus}`}>
          Keep supporting
        </Link>
      </div>
    </>
  );
}
