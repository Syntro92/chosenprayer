import {
  Community,
  ExploreChannels,
  FinalCta,
  HowItWorks,
  Introduction,
  WhyChosenPrayer,
} from "@/components/sections";
import { Skiper39 } from "@/components/ui/skiper39";

export default function Home() {
  return (
    <main>
      <div className="relative h-screen w-full overflow-hidden">
        <Skiper39 />
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
