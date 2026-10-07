import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import {
  Community,
  ExploreChannels,
  FinalCta,
  HowItWorks,
  Introduction,
  WhyChosenBless,
} from "@/components/sections";
import { Skiper39 } from "@/components/ui/skiper39";

export default function Home() {
  return (
    <main>
      <div className="relative h-screen w-full overflow-hidden">
        <Header />
        <Skiper39 />
      </div>
      <Introduction />
      <HowItWorks />
      <ExploreChannels />
      <Community />
      <WhyChosenBless />
      <FinalCta />
      <Footer />
    </main>
  );
}
