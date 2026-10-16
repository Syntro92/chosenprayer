import { PageSkeleton } from "@/components/ui/page-skeleton";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CommunityProvider } from "@/components/community/community-provider";
import { MembersGate } from "@/components/community/members-gate";
import { PostDetail } from "@/components/community/post-detail";
import { hasRole } from "@/server/auth/policy";
import { getActor } from "@/server/auth/session";
import { listComments } from "@/server/services/comments";
import { getPost, getViewer } from "@/server/services/posts";

export const metadata: Metadata = {
  title: "Post | Chosen Prayer Community",
};

async function Content({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const actor = await getActor();
  if (!actor || actor.status !== "active") return <MembersGate next={`/community/posts/${postId}`} />;

  let data;
  try {
    data = await Promise.all([getViewer(actor), getPost(actor, postId), listComments(actor, postId)]);
  } catch (e) {
    if ((e as { code?: string } | null)?.code === "NOT_FOUND") notFound();
    throw e;
  }
  const [viewer, { post, members }, thread] = data;
  return (
    <CommunityProvider
      session={{ user: viewer, isModerator: hasRole(actor, "admin"), isAdmin: hasRole(actor, "admin") }}
      initial={{
        posts: [post],
        comments: thread.comments,
        commentsLoadedFor: [post.id],
        members: [...members, ...thread.members],
      }}
    >
      <PostDetail postId={post.id} />
    </CommunityProvider>
  );
}

export default function PostPage({ params }: { params: Promise<{ postId: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}
