import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DeleteAccountForm, PasswordForm, ProfileForm } from "@/components/account/account-forms";
import { GivingSection } from "@/components/account/giving-section";
import { getActor } from "@/server/auth/session";
import { getMyProfile } from "@/server/services/accounts";
import { listMyDonations, listMySubscriptions } from "@/server/services/giving";

export const metadata: Metadata = {
  title: "Your Account | Chosen Prayer",
  robots: { index: false },
};

async function Account() {
  const actor = await getActor();
  if (!actor) redirect("/signin?next=/account");
  const [profile, donations, subscriptions] = await Promise.all([
    getMyProfile(actor),
    listMyDonations(actor, { limit: 10 }),
    listMySubscriptions(actor),
  ]);
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <header>
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-bless-deep">Your account</span>
        <h1 className="mt-3 text-3xl font-semibold leading-[1.1] tracking-tight text-charcoal-deep sm:text-4xl">
          {profile.displayName}
        </h1>
        <p className="mt-2 text-slate">@{profile.username}</p>
      </header>
      <ProfileForm profile={profile} />
      <GivingSection donations={donations.items} subscriptions={subscriptions} />
      <PasswordForm />
      <DeleteAccountForm />
    </div>
  );
}

export default function Page() {
  return (
    <main className="min-h-screen bg-ivory px-4 pb-24 pt-32 sm:pt-40">
      <Suspense fallback={<div className="mx-auto h-64 w-full max-w-2xl animate-pulse rounded-[28px] bg-white/60" />}>
        <Account />
      </Suspense>
    </main>
  );
}
