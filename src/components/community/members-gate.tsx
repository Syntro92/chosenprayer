import Link from "next/link";
import { Lock } from "lucide-react";
import { focus, primaryBtn, secondaryBtn } from "./ui";

/**
 * Shown to visitors who open a members-only page (a post or a member profile).
 * Server component: the real check happens on the server before any member data is fetched.
 */
export function MembersGate({ next }: { next: string }) {
  const q = encodeURIComponent(next);
  return (
    <main className="bg-ivory">
      <div className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col items-center justify-center px-4 pb-24 pt-32 text-center">
        <span aria-hidden className="flex size-14 items-center justify-center rounded-full bg-cream">
          <Lock size={22} />
        </span>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-charcoal-deep">This space is for members</h1>
        <p className="mt-3 text-base leading-relaxed text-slate">
          Posts, comments and member profiles are only visible to people in the Chosen Prayer community. Join to see
          what everyone is sharing.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href={`/signup?next=${q}`} className={primaryBtn}>Join the Community</Link>
          <Link href={`/signin?next=${q}`} className={secondaryBtn}>Sign In</Link>
        </div>
        <Link href="/community/welcome" className={`mt-6 rounded text-sm font-medium text-slate underline underline-offset-4 hover:text-charcoal-deep ${focus}`}>
          Read about the community
        </Link>
      </div>
    </main>
  );
}
