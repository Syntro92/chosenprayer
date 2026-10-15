import { PageSkeleton } from "@/components/ui/page-skeleton";
import type { Metadata } from "next";
import { Suspense } from "react";
import { CommunityProvider } from "@/components/community/community-provider";
import { CommunityFeed } from "@/components/community/feed";
import { CommunityLanding } from "@/components/community/landing";
import { hasRole } from "@/server/auth/policy";
import { getActor } from "@/server/auth/session";
import { countOpenReports } from "@/server/services/moderation";
import { listNotifications } from "@/server/services/notifications";
import { getViewer, listFeed } from "@/server/services/posts";

export const metadata: Metadata = {
  title: "Community | Chosen Prayer",
  description:
    "Share your moments, celebrate others, and connect with people who believe in making a difference.",
};

async function CommunityHome() {
  const actor = await getActor();
  // Visitors (and suspended members) see the join page; only active members see the feed.
  if (!actor || actor.status !== "active") return <CommunityLanding />;

  const moderator = hasRole(actor, "moderator");
  const [viewer, feed, notifications, openReports] = await Promise.all([
    getViewer(actor),
    listFeed(actor, {}),
    listNotifications(actor),
    moderator ? countOpenReports(actor) : Promise.resolve(undefined),
  ]);

  return (
    <CommunityProvider
      session={{ user: viewer, isModerator: moderator, isAdmin: hasRole(actor, "admin"), openReports }}
      initial={{ posts: feed.posts, members: feed.members, nextCursor: feed.nextCursor, notifications }}
    >
      <CommunityFeed />
    </CommunityProvider>
  );
}

export default function CommunityPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CommunityHome />
    </Suspense>
  );
}
