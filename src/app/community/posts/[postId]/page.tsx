import type { Metadata } from "next";
import { Suspense } from "react";
import { MembersOnly } from "@/components/community/members-only";
import { PostDetail } from "@/components/community/post-detail";
import { SAMPLE_POSTS } from "@/lib/community/sample-data";

export const metadata: Metadata = {
  title: "Post | Chosen Bless Community",
};

export function generateStaticParams() {
  return SAMPLE_POSTS.map((p) => ({ postId: p.id }));
}

async function Content({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  return (
    <MembersOnly>
      <PostDetail postId={postId} />
    </MembersOnly>
  );
}

export default function PostPage({ params }: { params: Promise<{ postId: string }> }) {
  return (
    <>
      <Suspense fallback={<main className="min-h-screen bg-ivory" />}>
        <Content params={params} />
      </Suspense>
    </>
  );
}
