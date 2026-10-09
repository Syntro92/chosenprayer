import type { Metadata } from "next";
import { CommunityFeed } from "@/components/community/feed";
import { CommunityLanding } from "@/components/community/landing";
import { MembersOnly } from "@/components/community/members-only";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";

export const metadata: Metadata = {
  title: "Community | Chosen Bless",
  description:
    "Share your moments, celebrate others, and connect with people who believe in making a difference.",
};

export default function CommunityPage() {
  return (
    <>
      <Header />
      {/* Visitors see the join page; only members see the feed. */}
      <MembersOnly fallback={<CommunityLanding />}>
        <CommunityFeed />
      </MembersOnly>
      <Footer />
    </>
  );
}
