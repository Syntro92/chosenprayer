import type { Metadata } from "next";
import Link from "next/link";
import { ChannelsExplorer } from "@/components/channels/channels-explorer";
import { CrowdIllustration } from "@/components/channels/illustrations";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";

export const metadata: Metadata = {
  title: "Channels | Chosen Bless",
  description:
    "Explore creators, communities and voices that inspire, encourage and make a difference.",
};

const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-charcoal-deep focus-visible:ring-offset-2";
const primaryBtn = `inline-flex h-12 items-center justify-center rounded-xl bg-bless px-6 text-sm font-semibold text-charcoal-deep shadow-sm transition hover:bg-bless-deep active:scale-[0.98] ${focus}`;
const wrap = "mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-10";

export default function ChannelsPage() {
  return (
    <>
      <Header />
      <main className="bg-ivory">
        {/* Hero */}
        <section className={`${wrap} flex max-w-3xl flex-col items-center pb-12 pt-32 text-center sm:pb-16 sm:pt-44`}>
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-bless-deep">
            Discover Channels
          </span>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.08] tracking-tight text-charcoal-deep sm:text-5xl lg:text-6xl">
            Find someone worth supporting.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-slate sm:text-lg">
            Explore creators, communities and voices that inspire, encourage
            and make a difference.
          </p>
        </section>

        <ChannelsExplorer />

        {/* Community message */}
        <section className={`${wrap} mt-24 sm:mt-32`}>
          <div className="grid items-center gap-10 overflow-hidden rounded-[22px] border border-line bg-white md:grid-cols-[1fr_1.1fr]">
            <div className="px-8 pt-10 sm:px-12 md:py-14">
              <h2 className="text-3xl font-semibold leading-[1.1] tracking-tight text-charcoal-deep sm:text-4xl">
                Every channel has a story.
              </h2>
              <p className="mt-4 max-w-md text-base leading-relaxed text-slate sm:text-lg">
                Behind every channel is someone creating something they believe
                is worth sharing.
              </p>
              <Link
                href="/how-it-works"
                className={`mt-7 inline-flex h-12 items-center rounded-xl border border-charcoal-deep/20 px-6 text-sm font-semibold text-charcoal-deep transition hover:border-charcoal-deep hover:bg-mist ${focus}`}
              >
                Learn How It Works
              </Link>
            </div>
            <div className="relative h-44 overflow-hidden md:h-full md:min-h-[260px]">
              {/* Cropped so the crowd appears to continue past the card */}
              <CrowdIllustration className="absolute -bottom-6 left-1/2 w-[620px] max-w-none -translate-x-1/2 md:left-8 md:translate-x-0" />
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="mt-24 bg-cream py-20 sm:mt-32 sm:py-28">
          <div className={`${wrap} flex max-w-3xl flex-col items-center text-center`}>
            <h2 className="text-3xl font-semibold leading-[1.1] tracking-tight text-charcoal-deep sm:text-4xl lg:text-5xl">
              Don&apos;t see what you&apos;re looking for?
            </h2>
            <p className="mt-5 text-base leading-relaxed text-charcoal-deep/75 sm:text-lg">
              Know someone whose work deserves support?
            </p>
            <Link href="/start" className={`mt-9 ${primaryBtn}`}>
              Start a Channel
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
