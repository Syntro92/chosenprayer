"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cancelSubscriptionAction, requestRefundAction } from "@/actions/giving";
import { formatMoney } from "@/lib/giving";
import type { MyDonation, MySubscription } from "@/server/services/giving";

const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-charcoal-deep focus-visible:ring-offset-2";
const card = "rounded-[28px] border border-line bg-white p-6 shadow-sm sm:p-8";

const date = (iso: string) =>
  new Date(iso).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const STATUS: Record<MySubscription["status"], string> = {
  active: "Active",
  past_due: "Payment overdue",
  paused: "Paused",
  canceled: "Ended",
};

function SubscriptionRow({ sub }: { sub: MySubscription }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const live = sub.status !== "canceled";

  async function cancel() {
    setBusy(true);
    setError("");
    const r = await cancelSubscriptionAction(sub.id);
    setBusy(false);
    if (!r.ok) return setError(r.error.message);
    setConfirming(false);
    router.refresh();
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-4">
      <div className="min-w-0">
        <p className="font-medium text-charcoal-deep">
          <Link href={`/channels/${sub.channel.handle}`} className={`rounded hover:underline ${focus}`}>
            {sub.channel.name}
          </Link>{" "}
          <span className="text-slate">· {formatMoney(sub.amountCents, sub.currency)} / month</span>
        </p>
        <p className="text-sm text-slate">
          {STATUS[sub.status]}
          {live && sub.currentPeriodEnd && ` · next payment around ${date(sub.currentPeriodEnd)}`}
        </p>
        {error && <p role="alert" className="mt-1 text-sm text-red-700">{error}</p>}
      </div>
      {live &&
        (confirming ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={cancel}
              disabled={busy}
              className={`h-10 rounded-xl bg-red-700 px-4 text-sm font-semibold text-white transition hover:bg-red-800 disabled:opacity-60 ${focus}`}
            >
              {busy ? "Canceling…" : "Yes, cancel"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className={`h-10 rounded-xl border border-line px-4 text-sm font-semibold text-charcoal-deep ${focus}`}
            >
              Keep it
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className={`h-10 rounded-xl border border-line px-4 text-sm font-semibold text-charcoal-deep transition hover:border-charcoal-deep/40 ${focus}`}
          >
            Cancel monthly support
          </button>
        ))}
    </li>
  );
}

function RefundControl({ id }: { id: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refund() {
    setBusy(true);
    setError("");
    const r = await requestRefundAction(id);
    setBusy(false);
    if (!r.ok) return setError(r.error.message);
    setConfirming(false);
    router.refresh();
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={`ml-3 rounded font-medium text-slate underline underline-offset-4 hover:text-charcoal-deep ${focus}`}
      >
        Request refund
      </button>
    );
  }
  return (
    <span className="ml-3 inline-flex flex-wrap items-center gap-2 font-normal">
      <span className="text-slate">Refund to your original payment method?</span>
      <button
        type="button"
        onClick={refund}
        disabled={busy}
        className={`rounded font-semibold text-red-700 underline underline-offset-4 disabled:opacity-60 ${focus}`}
      >
        {busy ? "Refunding…" : "Yes, refund"}
      </button>
      <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={`rounded text-slate underline underline-offset-4 ${focus}`}>
        Keep gift
      </button>
      {error && <span role="alert" className="basis-full text-red-700">{error}</span>}
    </span>
  );
}

export function GivingSection({ donations, subscriptions }: { donations: MyDonation[]; subscriptions: MySubscription[] }) {
  return (
    <section className={card} aria-labelledby="giving-h">
      <h2 id="giving-h" className="text-xl font-semibold tracking-tight text-charcoal-deep">Your giving</h2>

      {subscriptions.length === 0 && donations.length === 0 ? (
        <p className="mt-3 text-sm leading-relaxed text-slate">
          When you support a channel it will show up here.{" "}
          <Link href="/channels" className={`rounded font-medium text-charcoal-deep underline underline-offset-4 ${focus}`}>
            Explore channels
          </Link>
        </p>
      ) : (
        <>
          {subscriptions.length > 0 && (
            <>
              <h3 className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-slate">Monthly support</h3>
              <ul className="mt-1 divide-y divide-line">
                {subscriptions.map((s) => (
                  <SubscriptionRow key={s.id} sub={s} />
                ))}
              </ul>
            </>
          )}
          {donations.length > 0 && (
            <>
              <h3 className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-slate">Recent gifts</h3>
              <ul className="mt-1 divide-y divide-line">
                {donations.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <span className="min-w-0">
                      <Link href={`/channels/${d.channel.handle}`} className={`rounded font-medium text-charcoal-deep hover:underline ${focus}`}>
                        {d.channel.name}
                      </Link>
                      <span className="text-slate"> · {date(d.createdAt)}{d.frequency === "monthly" ? " · monthly" : ""}</span>
                    </span>
                    <span className="font-semibold text-charcoal-deep">
                      {formatMoney(d.amountCents, d.currency)}
                      {d.status === "refunded" && <span className="ml-2 font-normal text-slate">refunded</span>}
                      {d.receiptUrl && (
                        <a
                          href={d.receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`ml-3 rounded font-medium text-charcoal-deep underline underline-offset-4 ${focus}`}
                        >
                          Receipt
                        </a>
                      )}
                      {d.status === "succeeded" && <RefundControl id={d.id} />}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
