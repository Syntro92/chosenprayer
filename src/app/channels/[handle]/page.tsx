import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChannelProfile } from "@/components/channels/channel-profile";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { CHANNELS, getChannel, getProfileData } from "@/lib/channels";

export function generateStaticParams() {
  return CHANNELS.map((c) => ({ handle: c.handle }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const channel = getChannel(handle);
  if (!channel) return {};
  return {
    title: `${channel.name} | Chosen Bless`,
    description: channel.description,
  };
}

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const channel = getChannel(handle);
  if (!channel) notFound();

  return (
    <>
      <Header />
      <main className="bg-ivory">
        <ChannelProfile channel={channel} data={getProfileData(channel)} />
      </main>
      <Footer />
    </>
  );
}
