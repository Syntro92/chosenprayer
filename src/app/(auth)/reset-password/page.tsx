import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { getActor } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Choose a New Password | Chosen Prayer",
  robots: { index: false },
};

/** Only reachable with a live session, which the emailed reset link creates. */
async function Reset() {
  if (!(await getActor())) {
    return (
      <div className="w-full max-w-md rounded-[28px] border border-line bg-white p-6 text-center shadow-sm sm:p-10">
        <h1 className="text-2xl font-semibold tracking-tight text-charcoal-deep">This link has expired</h1>
        <p className="mt-3 text-base leading-relaxed text-slate">
          Reset links work once and only for a short time. Request a fresh one and we&apos;ll email it right away.
        </p>
        <Link
          href="/forgot-password"
          className="mt-6 inline-flex h-12 items-center justify-center rounded-xl bg-bless px-6 text-sm font-semibold text-charcoal-deep shadow-sm transition hover:bg-bless-deep"
        >
          Request a new link
        </Link>
      </div>
    );
  }
  return <AuthForm mode="reset" />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Reset />
    </Suspense>
  );
}
