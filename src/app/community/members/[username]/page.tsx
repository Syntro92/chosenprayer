import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CommunityProvider } from "@/components/community/community-provider";
import { MemberProfile } from "@/components/community/member-profile";
import { MembersGate } from "@/components/community/members-gate";
import { hasRole } from "@/server/auth/policy";
import { getActor } from "@/server/auth/session";
import { getViewer, listMemberPosts } from "@/server/services/posts";

export const metadata: Metadata = {
  title: "Member | Chosen Prayer Community",
};

async function Content({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const actor = await getActor();
  if (!actor || actor.status !== "active") return <MembersGate next={`/community/members/${username}`} />;

  let data;
  try {
    data = await Promise.all([getViewer(actor), listMemberPosts(actor, username, {})]);
  } catch (e) {
    if ((e as { code?: string } | null)?.code === "NOT_FOUND") notFound();
    throw e;
  }
  const [viewer, page] = data;
  return (
    <CommunityProvider session={{ user: viewer, isModerator: hasRole(actor, "moderator"), isAdmin: hasRole(actor, "admin") }} initial={{ posts: page.posts, members: page.members }}>
      <MemberProfile
        member={page.member}
        initialCursor={page.nextCursor}
        // Only admins get account tools, and never over another admin or over themselves.
        admin={
          hasRole(actor, "admin") && page.memberRole !== "admin" && page.member.id !== actor.userId
            ? { status: page.memberStatus, role: page.memberRole }
            : undefined
        }
      />
    </CommunityProvider>
  );
}

export default function MemberPage({ params }: { params: Promise<{ username: string }> }) {
  return (
    <Suspense fallback={<main className="min-h-screen bg-ivory" />}>
      <Content params={params} />
    </Suspense>
  );
}
