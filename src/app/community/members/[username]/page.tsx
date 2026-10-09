import type { Metadata } from "next";
import { Suspense } from "react";
import { MembersOnly } from "@/components/community/members-only";
import { MemberProfile } from "@/components/community/member-profile";
import { SAMPLE_MEMBERS } from "@/lib/community/sample-data";

export const metadata: Metadata = {
  title: "Member | Chosen Bless Community",
};

export function generateStaticParams() {
  return SAMPLE_MEMBERS.map((m) => ({ username: m.username }));
}

async function Content({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return (
    <MembersOnly>
      <MemberProfile username={username} />
    </MembersOnly>
  );
}

export default function MemberPage({ params }: { params: Promise<{ username: string }> }) {
  return (
    <>
      <Suspense fallback={<main className="min-h-screen bg-ivory" />}>
        <Content params={params} />
      </Suspense>
    </>
  );
}
