import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChannelProfile } from "@/components/channels/channel-profile";
import { getChannelProfilePublic } from "@/server/cache/channels";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getChannelProfilePublic(handle);
  if (!profile) return {};
  return {
    title: `${profile.channel.name} | Chosen Prayer`,
    description: profile.channel.description,
  };
}

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const profile = await getChannelProfilePublic(handle);
  if (!profile) notFound();

  return (
    <>
      <main className="bg-ivory">
        <ChannelProfile channel={profile.channel} data={profile.data} />
      </main>
    </>
  );
}
