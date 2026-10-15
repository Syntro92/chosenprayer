import { PageSkeleton } from "@/components/ui/page-skeleton";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MembersGate } from "@/components/community/members-gate";
import { ModerationQueue } from "@/components/community/moderation-queue";
import { hasRole } from "@/server/auth/policy";
import { getActor } from "@/server/auth/session";
import { listReports } from "@/server/services/moderation";

export const metadata: Metadata = {
  title: "Report queue | Chosen Prayer Community",
  robots: { index: false },
};

async function Queue() {
  const actor = await getActor();
  if (!actor || actor.status !== "active") return <MembersGate next="/community/moderation" />;
  // Don't reveal that this page exists to people who aren't moderators.
  if (!hasRole(actor, "moderator")) notFound();
  const initial = await listReports(actor, { status: "open" });
  return <ModerationQueue initial={initial} />;
}

export default function ModerationPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Queue />
    </Suspense>
  );
}
