import { CommunityProvider } from "@/components/community/community-provider";

// Shared client state for the feed, post detail and member profile routes.
// DEMO: state lives in memory and resets on a full page reload.
export default function CommunityLayout({ children }: { children: React.ReactNode }) {
  return <CommunityProvider>{children}</CommunityProvider>;
}
