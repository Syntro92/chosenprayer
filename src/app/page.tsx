import {
  Community,
  ExploreChannels,
  FinalCta,
  HowItWorks,
  Introduction,
  WhyChosenPrayer,
} from "@/components/sections";
import { Skiper39 } from "@/components/ui/skiper39";
import { getHeroImageUrlCached } from "@/server/cache/site";

export default async function Home() {
  const heroImage = await getHeroImageUrlCached();
  return (
    <main>
      <div className="relative h-screen w-full overflow-hidden">
        <Skiper39 coverUrl={heroImage} />
      </div>
      <Introduction />
      <HowItWorks />
      <ExploreChannels />
      <Community />
      <WhyChosenPrayer />
      <FinalCta />
    </main>
  );
}
