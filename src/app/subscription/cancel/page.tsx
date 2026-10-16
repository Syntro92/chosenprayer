import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CancelByLink } from "@/components/account/cancel-by-link";
import { formatMoney } from "@/lib/giving";
import { getSubscriptionForCancel } from "@/server/services/giving";

export const metadata: Metadata = {
  title: "Cancel monthly support | Chosen Prayer",
  robots: { index: false },
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const shell = "mx-auto mt-32 w-full max-w-md rounded-[28px] border border-line bg-white p-6 shadow-sm sm:p-8";

async function Cancel({ searchParams }: { searchParams: PageProps<"/subscription/cancel">["searchParams"] }) {
  const token = first((await searchParams).token);
  const sub = await getSubscriptionForCancel(token);

  if (!sub) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight text-charcoal-deep">This link isn&apos;t valid</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate">
          Use the button in your most recent payment email, or{" "}
          <Link href="/account" className="font-medium text-charcoal-deep underline underline-offset-4">manage your support from your account</Link>.
        </p>
      </>
    );
  }
  if (sub.canceled) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight text-charcoal-deep">Already canceled</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate">Your monthly support for {sub.channelName} has ended. You won&apos;t be charged again.</p>
      </>
    );
  }
  return <CancelByLink token={token!} channelName={sub.channelName} amount={formatMoney(sub.amountCents, sub.currency)} />;
}

export default function Page(props: PageProps<"/subscription/cancel">) {
  return (
    <main className="min-h-screen bg-ivory px-4">
      <div className={shell}>
        <Suspense fallback={<p className="text-sm text-slate">Loading…</p>}>
          <Cancel searchParams={props.searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
