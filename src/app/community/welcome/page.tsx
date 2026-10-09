import type { Metadata } from "next";
import { CommunityLanding } from "@/components/community/landing";

export const metadata: Metadata = {
  title: "Community | Chosen Bless",
  description:
    "Discover the people behind the blessings and connect with others who believe small acts of support can make a meaningful difference.",
};

// Public page: always visible, including to visitors.
export default function CommunityWelcomePage() {
  return (
    <>
      <CommunityLanding />
    </>
  );
}
