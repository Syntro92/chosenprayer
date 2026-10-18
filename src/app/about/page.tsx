import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { CrowdIllustration } from "@/components/channels/illustrations";

export const metadata: Metadata = {
  title: "About | Chosen Prayer",
  description:
    "Chosen Prayer is an independent Christian inspirational media platform sharing prayers, uplifting messages and biblical wisdom.",
};

/* ---------- Copy (easy to replace) ---------- */
const PURPOSE = [
  "At Chosen Prayer, we believe that every person deserves a moment of peace, a message of hope, and a reminder that they are never alone in their journey.",
  "Our mission is to inspire hearts, strengthen faith, and bring encouragement to people around the world through the power of digital storytelling.",
  "Through carefully created videos, meaningful reflections and uplifting messages, we aim to provide a welcoming space where people can find encouragement during life's challenges.",
];

const STEPS = [
  {
    n: "01",
    title: "Prayer & encouragement",
    text: "Daily prayers, spiritual encouragement and inspiration for life's difficult moments.",
    icon: "discover",
  },
  {
    n: "02",
    title: "Biblical wisdom",
    text: "Christian motivational videos, biblical wisdom and reflections for personal growth.",
    icon: "connect",
  },
  {
    n: "03",
    title: "Faith & hope",
    text: "Faith-centered storytelling that encourages spiritual reflection and positive living.",
    icon: "support",
  },
] as const;

const PRINCIPLES = [
  { title: "Voluntary", text: "Financial support is entirely optional, and public content stays free.", icon: "voluntary" },
  { title: "Transparent", text: "We are clear about who we are, how payments work and what support does.", icon: "meaningful" },
  { title: "Respectful", text: "Responsible publishing and a positive, encouraging online environment.", icon: "direct" },
  { title: "Community", text: "Kindness, compassion and spiritual inspiration shared across borders.", icon: "community" },
] as const;

/* ---------- Styles ---------- */
const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-charcoal-deep focus-visible:ring-offset-2";
const primaryBtn = `inline-flex h-12 items-center justify-center rounded-xl bg-bless px-6 text-sm font-semibold text-charcoal-deep shadow-sm transition hover:bg-bless-deep active:scale-[0.98] ${focus}`;
const secondaryBtn = `inline-flex h-12 items-center justify-center rounded-xl border border-charcoal-deep/20 px-6 text-sm font-semibold text-charcoal-deep transition hover:border-charcoal-deep hover:bg-white/60 ${focus}`;
const wrap = "mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-10";
const eyebrow = "text-xs font-semibold uppercase tracking-[0.2em] text-bless-deep";
const h2 = "text-3xl font-semibold leading-[1.1] tracking-tight text-charcoal-deep sm:text-4xl lg:text-5xl";

/* ---------- Small hand-drawn line icons ---------- */
const ICONS: Record<string, ReactNode> = {
  discover: (
    <>
      <circle cx="20" cy="20" r="11" fill="var(--color-cream)" />
      <path d="m29 29 11 11" />
      <path d="M15 22c2 3 8 3 10 0" strokeWidth="1.4" />
    </>
  ),
  connect: (
    <>
      <circle cx="17" cy="22" r="9" fill="var(--color-cream)" />
      <circle cx="31" cy="22" r="9" />
      <path d="M14 44c0-6 3-9 3-9m17 9c0-6-3-9-3-9" />
    </>
  ),
  support: (
    <path
      d="M24 40S8 30 8 19a8 8 0 0 1 16-2 8 8 0 0 1 16 2c0 11-16 21-16 21Z"
      fill="var(--color-cream)"
    />
  ),
  voluntary: (
    <>
      <path d="M8 30c6-3 10-3 16 0l16-8" />
      <circle cx="24" cy="14" r="6" fill="var(--color-cream)" />
      <path d="M8 38h32" />
    </>
  ),
  meaningful: (
    <>
      <circle cx="24" cy="24" r="14" />
      <circle cx="24" cy="24" r="6" fill="var(--color-cream)" />
    </>
  ),
  direct: (
    <>
      <path d="M8 36 38 10" />
      <path d="M26 10h12v12" />
      <circle cx="12" cy="34" r="4" fill="var(--color-cream)" />
    </>
  ),
  community: (
    <>
      <circle cx="14" cy="16" r="5" />
      <circle cx="24" cy="12" r="6" fill="var(--color-cream)" />
      <circle cx="34" cy="16" r="5" />
      <path d="M6 38c0-9 4-14 8-14M42 38c0-9-4-14-8-14M14 40c0-10 4-16 10-16s10 6 10 16" />
    </>
  ),
};

function LineIcon({ name }: { name: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className="size-12 text-charcoal-deep"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {ICONS[name]}
    </svg>
  );
}

export default function AboutPage() {
  return (
    <>
      <main className="bg-ivory">
        {/* Hero */}
        <section className={`${wrap} flex max-w-4xl flex-col items-center pb-8 pt-32 text-center sm:pt-44`}>
          <span className={`${eyebrow} rise-in`}>About Chosen Prayer</span>
          <h1
            className="rise-in mt-5 text-5xl font-semibold leading-[1.04] tracking-tight text-charcoal-deep sm:text-6xl lg:text-7xl"
            style={{ "--d": "80ms" } as CSSProperties}
          >
            Support what{" "}
            <span className="relative whitespace-nowrap">
              matters.
              <svg
                viewBox="0 0 200 12"
                preserveAspectRatio="none"
                className="absolute -bottom-1 left-0 h-2.5 w-full text-bless"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M3 8c40-6 90-6 194-2" />
              </svg>
            </span>
          </h1>
          <p
            className="rise-in mt-7 max-w-2xl text-base leading-relaxed text-slate sm:text-xl"
            style={{ "--d": "160ms" } as CSSProperties}
          >
            Faith. Hope. Inspiration. A journey closer to God. Chosen Prayer is
            an independent Christian inspirational media platform sharing
            prayers, uplifting messages and biblical wisdom.
          </p>
        </section>
        <div className="mx-auto mt-10 h-36 w-full max-w-3xl overflow-hidden sm:mt-14 sm:h-44">
          <CrowdIllustration className="mx-auto w-[560px] max-w-none sm:w-full" />
        </div>

        {/* Our purpose */}
        <section className={`${wrap} mt-24 sm:mt-36`}>
          <div className="grid gap-10 border-t border-line pt-12 md:grid-cols-[1fr_1.1fr] md:gap-20 md:pt-16">
            <div>
              <span className={eyebrow}>Our purpose</span>
              <h2 className={`mt-4 max-w-md ${h2}`}>Our mission</h2>
            </div>
            <div className="space-y-6 text-lg leading-relaxed text-charcoal-deep/80 sm:text-xl">
              {PURPOSE.map((p, i) => (
                <p key={i} className={i === 1 ? "font-medium text-charcoal-deep" : ""}>
                  {p}
                </p>
              ))}
            </div>
          </div>
        </section>

        {/* The idea */}
        <section className={`${wrap} mt-24 sm:mt-36`}>
          <div className="relative overflow-hidden rounded-[28px] bg-charcoal-deep px-6 py-16 text-center sm:px-16 sm:py-24">
            <svg
              viewBox="0 0 400 160"
              preserveAspectRatio="xMidYMid slice"
              className="absolute inset-0 size-full text-white/10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden
            >
              <circle cx="330" cy="40" r="22" />
              <path d="M0 130c60-30 110-30 170 0s120 30 230-10" />
              <path d="M0 148c70-24 130-24 190 0s130 20 210-6" />
            </svg>
            <div className="relative mx-auto max-w-3xl">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-bless">Our vision</span>
              <h2 className="mt-5 text-3xl font-semibold leading-[1.12] tracking-tight text-white sm:text-5xl">
                Uplifting messages of faith and hope,
                <br className="hidden sm:block" />{" "}
                <span className="text-bless">for everyone.</span>
              </h2>
              <p className="mx-auto mt-7 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">
                We envision a world where uplifting messages of faith and hope
                can reach people regardless of geographical boundaries, and a
                positive community built around kindness, encouragement,
                compassion and spiritual inspiration.
              </p>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className={`${wrap} mt-24 sm:mt-36`}>
          <div className="max-w-xl">
            <span className={eyebrow}>What we create</span>
            <h2 className={`mt-4 ${h2}`}>Content for every season of life.</h2>
          </div>
          <ol className="mt-12 grid gap-5 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-[22px] border border-line bg-white p-7 sm:p-8">
                <div className="flex items-start justify-between">
                  <LineIcon name={s.icon} />
                  <span className="text-sm font-semibold tabular-nums text-bless-deep">{s.n}</span>
                </div>
                <h3 className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-charcoal-deep">
                  {s.title}
                </h3>
                <p className="mt-3 text-base leading-relaxed text-slate">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Principles */}
        <section className={`${wrap} mt-24 sm:mt-36`}>
          <h2 className={`max-w-xl ${h2}`}>Our commitment</h2>
          <div className="mt-12 grid gap-x-12 gap-y-10 border-t border-line pt-10 sm:grid-cols-2">
            {PRINCIPLES.map((p) => (
              <div key={p.title} className="flex gap-5">
                <div className="shrink-0">
                  <LineIcon name={p.icon} />
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-bless-deep">
                    {p.title}
                  </h3>
                  <p className="mt-2 text-lg leading-snug text-charcoal-deep sm:text-xl">{p.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Community */}
        <section className="mt-24 overflow-hidden sm:mt-36">
          <div className={`${wrap} flex max-w-3xl flex-col items-center text-center`}>
            <h2 className={h2}>Support our creative work.</h2>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate sm:text-lg">
              Creating meaningful content takes time, creativity, research,
              production and ongoing website maintenance. Visitors who
              appreciate it may voluntarily support our work with one-time
              contributions that help fund video production, editing and
              publishing.
            </p>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate sm:text-base">
              Support is entirely optional and our public content stays
              accessible without it. Contributions are voluntary creator-support
              payments and are not tax-deductible charitable donations.
            </p>
          </div>
          <div className="mx-auto mt-14 h-52 max-w-5xl overflow-hidden sm:h-72">
            <CrowdIllustration className="mx-auto w-[760px] max-w-none sm:w-full" />
          </div>
        </section>

        {/* Final CTA */}
        <section className="bg-cream py-20 sm:py-28">
          <div className={`${wrap} flex max-w-3xl flex-col items-center text-center`}>
            <h2 className={h2}>Be part of the journey.</h2>
            <p className="mt-5 text-base leading-relaxed text-charcoal-deep/75 sm:text-lg">
              Together, we can continue sharing faith, hope and encouragement.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/channels" className={primaryBtn}>
                Explore Channels
              </Link>
              <Link href="/contact" className={secondaryBtn}>
                Contact Us
              </Link>
            </div>
            <p className="mt-8 text-xs text-slate">
              Chosen Prayer is an independent Christian inspirational media platform operated by SYNTRO SOLUTIONS LLC.
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
