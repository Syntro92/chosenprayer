import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { RefundByLink } from "@/components/account/refund-by-link";
import { formatMoney, REFUND_WINDOW_DAYS } from "@/lib/giving";
import { getDonationForRefund } from "@/server/services/giving";

export const metadata: Metadata = {
  title: "Request a refund | Chosen Prayer",
  robots: { index: false },
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const shell = "mx-auto mt-32 w-full max-w-md rounded-[28px] border border-line bg-white p-6 shadow-sm sm:p-8";

async function Refund({ searchParams }: { searchParams: PageProps<"/donation/refund">["searchParams"] }) {
  const token = first((await searchParams).token);
  const d = await getDonationForRefund(token);

  if (!d) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight text-charcoal-deep">This link isn&apos;t valid</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate">
          Use the button in your payment email, or{" "}
          <Link href="/account" className="font-medium text-charcoal-deep underline underline-offset-4">manage your giving from your account</Link>.
        </p>
      </>
    );
  }
  if (d.status === "refunded") {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight text-charcoal-deep">Already refunded</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate">Your gift to {d.channelName} has been refunded to your original payment method.</p>
      </>
    );
  }
  if (d.status !== "succeeded") {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight text-charcoal-deep">Nothing to refund</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate">That payment was never completed, so you haven&apos;t been charged.</p>
      </>
    );
  }
  if (d.expired) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight text-charcoal-deep">The refund period has ended</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate">
          Gifts can be refunded within {REFUND_WINDOW_DAYS} days of paying. Your gift to {d.channelName} is past that, so please contact us if you need help.
        </p>
      </>
    );
  }
  return <RefundByLink token={token!} channelName={d.channelName} amount={formatMoney(d.amountCents, d.currency)} />;
}

export default function Page(props: PageProps<"/donation/refund">) {
  return (
    <main className="min-h-screen bg-ivory px-4">
      <div className={shell}>
        <Suspense fallback={<p className="text-sm text-slate">Loading…</p>}>
          <Refund searchParams={props.searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
