"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { useCommunity } from "./community-provider";
import { focus, primaryBtn, secondaryBtn } from "./ui";

/**
 * Members-only gate. Visitors never see community content; they see `fallback`.
 * INTEGRATION POINT: `role` comes from the demo switcher. Replace it with the
 * real session, and enforce the same rule on the server/API. A client-side gate
 * alone is not security.
 */
export function MembersOnly({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { role, setRole } = useCommunity();
  if (role !== "visitor") return <>{children}</>;

  return (
    <>
      {fallback ?? <DefaultGate />}
      <div className="fixed bottom-4 left-4 z-40 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl border border-dashed border-bless-deep/60 bg-cream px-4 py-2.5 shadow-md">
        <p className="text-xs leading-snug text-charcoal-deep">
          <span className="font-semibold">Demo mode.</span> No real sign-in yet.
        </p>
        <button
          type="button"
          onClick={() => setRole("member")}
          className={`shrink-0 rounded-lg bg-charcoal-deep px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-charcoal-deep/90 ${focus}`}
        >
          Preview as member
        </button>
      </div>
    </>
  );
}

function DefaultGate() {
  return (
    <main className="bg-ivory">
      <div className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col items-center justify-center px-4 pb-24 pt-32 text-center">
        <span aria-hidden className="flex size-14 items-center justify-center rounded-full bg-cream">
          <Lock size={22} />
        </span>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-charcoal-deep">
          This space is for members
        </h1>
        <p className="mt-3 text-base leading-relaxed text-slate">
          Posts, comments and member profiles are only visible to people in the Chosen Bless
          community. Join to see what everyone is sharing.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/community" className={primaryBtn}>Join the Community</Link>
          <Link href="/signin" className={secondaryBtn}>Sign In</Link>
        </div>
      </div>
    </main>
  );
}
