import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Heart, MessageCircleHeart } from "lucide-react";
import { CrowdIllustration } from "@/components/channels/illustrations";
import CommunityOrbit, {
  type OrbitItem,
} from "@/components/ui/builders-community-hero";
import {
  JoinCommunityButton,
  JoinCommunityProvider,
} from "@/components/community/join-community";

/* ---------- Copy (easy to replace) ---------- */
const HIGHLIGHTS = [
  {
    title: "Shared Kindness",
    text: "Every contribution begins with someone who cares. Celebrate the small acts that bring people together.",
    icon: "kindness",
  },
  {
    title: "People Who Inspire",
    text: "Discover creators, communities, and causes that make a difference in people's lives.",
    icon: "inspire",
  },
  {
    title: "A Place to Belong",
    text: "Be part of a growing community built around encouragement, appreciation, and meaningful support.",
    icon: "belong",
  },
] as const;

// Illustrative only. Not real members, messages or activity.
const SAMPLE_MESSAGES = [
  "Your videos got me through a hard week. Thank you for being here.",
  "I learned something new today and wanted to say thanks.",
  "Wishing everyone a gentle, good day. You matter.",
];

const SAMPLE_ACTIVITY = [
  { title: "A thank-you note", text: "Members could leave a kind word for a channel that made their day.", icon: "note" },
  { title: "A warm welcome", text: "New members could be greeted by people who remember being new.", icon: "welcome" },
  { title: "Something that inspired me", text: "Members could share the work that stayed with them.", icon: "spark" },
] as const;

// Decorative only: words and icons, no counts or activity claims.
const memoji = (n: number) => `https://raw.githubusercontent.com/alohe/memojis/main/png/memo_${n}.png`;
const ORBIT_ITEMS: OrbitItem[] = [
  { kind: "status", ring: "outer", angle: 132, label: "A kind word" },
  { kind: "card", ring: "outer", angle: 112.6, emoji: "💛" },
  { kind: "pill", ring: "outer", angle: 90, icon: "🌱", label: "Growing together" },
  { kind: "pill", ring: "outer", angle: 67.6, icon: <Heart size={13} strokeWidth={2} />, label: "Thank you" },
  { kind: "avatar", ring: "outer", angle: 50.9, src: memoji(9), color: "#c4bceb" },
  { kind: "pill", ring: "outer", angle: 35.2, icon: <MessageCircleHeart size={13} strokeWidth={2} />, label: "Encouragement" },
  { kind: "avatar", ring: "inner", angle: 137.2, src: memoji(19), color: "#ffdcb6" },
  { kind: "pill", ring: "inner", angle: 116.6, icon: "🌼", label: "Welcome" },
  { kind: "avatar", ring: "inner", angle: 90, src: memoji(35), color: "#c0cef3", size: 48 },
  { kind: "card", ring: "inner", angle: 63.3, emoji: "🤝" },
  { kind: "check", ring: "inner", angle: 41.8 },
];

const AVATAR_TONES = ["bg-cream", "bg-mist", "bg-bless/40", "bg-sage/30", "bg-line"];

/* ---------- Styles ---------- */
const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-charcoal-deep focus-visible:ring-offset-2";
const primaryBtn = `inline-flex h-12 items-center justify-center rounded-xl bg-bless px-6 text-sm font-semibold text-charcoal-deep shadow-sm transition hover:bg-bless-deep active:scale-[0.98] ${focus}`;
const secondaryBtn = `inline-flex h-12 items-center justify-center rounded-xl border border-charcoal-deep/20 px-6 text-sm font-semibold text-charcoal-deep transition hover:border-charcoal-deep hover:bg-white/60 active:scale-[0.98] ${focus}`;
const wrap = "mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-10";
const eyebrow = "text-xs font-semibold uppercase tracking-[0.2em] text-bless-deep";
const h2 = "text-3xl font-semibold leading-[1.1] tracking-tight text-charcoal-deep sm:text-4xl lg:text-5xl";

/* ---------- Line icons (same style as the About page) ---------- */
const ICONS: Record<string, ReactNode> = {
  kindness: (
    <path
      d="M24 40S8 30 8 19a8 8 0 0 1 16-2 8 8 0 0 1 16 2c0 11-16 21-16 21Z"
      fill="var(--color-cream)"
    />
  ),
  inspire: (
    <>
      <path d="M24 6v6M24 36v6M6 24h6M36 24h6M11 11l4 4M33 33l4 4M37 11l-4 4M15 33l-4 4" />
      <circle cx="24" cy="24" r="7" fill="var(--color-cream)" />
    </>
  ),
  belong: (
    <>
      <circle cx="14" cy="16" r="5" />
      <circle cx="24" cy="12" r="6" fill="var(--color-cream)" />
      <circle cx="34" cy="16" r="5" />
      <path d="M6 38c0-9 4-14 8-14M42 38c0-9-4-14-8-14M14 40c0-10 4-16 10-16s10 6 10 16" />
    </>
  ),
  note: (
    <>
      <rect x="9" y="10" width="30" height="26" rx="4" fill="var(--color-cream)" />
      <path d="M16 19h16M16 26h10" />
    </>
  ),
  welcome: (
    <>
      <circle cx="24" cy="16" r="7" fill="var(--color-cream)" />
      <path d="M10 40c0-8 6-13 14-13s14 5 14 13" />
    </>
  ),
  spark: (
    <path
      d="M24 6l4.5 11.5L40 22l-11.5 4.5L24 38l-4.5-11.5L8 22l11.5-4.5L24 6Z"
      fill="var(--color-cream)"
    />
  ),
};

function LineIcon({ name, className = "size-12" }: { name: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={`${className} text-charcoal-deep`}
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

function Avatar({ tone, className = "size-12" }: { tone: string; className?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full border border-line ${tone} ${className}`} aria-hidden>
      <svg viewBox="0 0 48 48" className="size-3/4 text-charcoal-deep" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="24" cy="19" r="6" />
        <path d="M12 40c0-7 5-11 12-11s12 4 12 11" />
      </svg>
    </span>
  );
}

function SampleTag({ children = "Example" }: { children?: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-line bg-ivory px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate">
      {children}
    </span>
  );
}

export function CommunityLanding() {
  return (
    <JoinCommunityProvider>
      <main className="bg-ivory">
        {/* Hero */}
        <section className="relative overflow-hidden pb-16 pt-32 sm:pb-24 sm:pt-44">
          <div className={`${wrap} relative z-10 flex flex-col items-center text-center`}>
            <span className={`${eyebrow} rise-in`}>More than support</span>
            <h1
              className="rise-in mt-5 max-w-4xl text-5xl font-semibold leading-[1.04] tracking-tight text-charcoal-deep sm:text-6xl lg:text-7xl"
              style={{ "--d": "80ms" } as CSSProperties}
            >
              A community built on{" "}
              <span className="relative whitespace-nowrap">
                kindness.
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
              Discover the people behind the blessings. Connect with others who
              believe small acts of support can make a meaningful difference.
            </p>
            <div
              className="rise-in mt-9 flex flex-col gap-3 sm:flex-row"
              style={{ "--d": "240ms" } as CSSProperties}
            >
              <JoinCommunityButton className={primaryBtn} />
              <Link href="/channels" className={secondaryBtn}>
                Explore Channels
              </Link>
            </div>
          </div>
          <div className="mx-auto mt-14 h-36 w-full max-w-3xl overflow-hidden opacity-70 sm:mt-20 sm:h-44">
            <CrowdIllustration className="mx-auto w-[560px] max-w-none sm:w-full" />
          </div>
        </section>

        {/* Highlights */}
        <section className={`${wrap} pb-24 sm:pb-32`} aria-labelledby="highlights-heading">
          <h2 id="highlights-heading" className="sr-only">
            What the community is about
          </h2>
          <ul className="grid gap-5 md:grid-cols-3">
            {HIGHLIGHTS.map((h) => (
              <li
                key={h.title}
                className="group rounded-[22px] border border-line bg-white p-7 transition duration-200 hover:-translate-y-1 hover:border-bless motion-reduce:transform-none sm:p-8"
              >
                <LineIcon name={h.icon} />
                <h3 className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-charcoal-deep">
                  {h.title}
                </h3>
                <p className="mt-3 text-base leading-relaxed text-slate">{h.text}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Preview */}
        <section className="border-y border-line bg-white py-24 sm:py-32" aria-labelledby="preview-heading">
          <div className={wrap}>
            <div className="max-w-xl">
              <span className={eyebrow}>A glimpse ahead</span>
              <h2 id="preview-heading" className={`mt-4 ${h2}`}>
                What your community could feel like.
              </h2>
              <p className="mt-5 text-base leading-relaxed text-slate sm:text-lg">
                We&apos;re still building this. Everything below is an
                illustration, not real people or live activity.
              </p>
            </div>

            <div className="mt-12 rounded-[28px] border border-line bg-ivory p-5 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center">
                  <ul className="flex -space-x-3" aria-label="Example community members">
                    {AVATAR_TONES.map((tone, i) => (
                      <li key={i} className="rounded-full ring-4 ring-ivory">
                        <Avatar tone={tone} />
                      </li>
                    ))}
                  </ul>
                  <p className="ml-4 text-sm text-slate">Your future neighbours</p>
                </div>
                <SampleTag>Illustration only</SampleTag>
              </div>

              <div className="mt-8 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
                <div className="space-y-3">
                  {SAMPLE_MESSAGES.map((m, i) => (
                    <figure
                      key={m}
                      className={`flex items-start gap-3 rounded-2xl border border-line bg-white p-4 sm:p-5 ${i === 1 ? "sm:ml-8" : ""}`}
                    >
                      <Avatar tone={AVATAR_TONES[(i + 1) % AVATAR_TONES.length]} className="size-10" />
                      <div className="min-w-0">
                        <figcaption className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-charcoal-deep">Example message</span>
                          <SampleTag>Sample</SampleTag>
                        </figcaption>
                        <blockquote className="mt-1.5 text-base leading-relaxed text-charcoal-deep/85">
                          &ldquo;{m}&rdquo;
                        </blockquote>
                      </div>
                    </figure>
                  ))}
                </div>

                <ul className="grid gap-3">
                  {SAMPLE_ACTIVITY.map((a) => (
                    <li
                      key={a.title}
                      className="flex items-start gap-4 rounded-2xl border border-line bg-white p-4 transition-colors duration-200 hover:border-bless sm:p-5"
                    >
                      <LineIcon name={a.icon} className="size-10 shrink-0" />
                      <div>
                        <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-charcoal-deep">
                          {a.title}
                          <SampleTag>Idea</SampleTag>
                        </h3>
                        <p className="mt-1 text-sm leading-relaxed text-slate">{a.text}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <p className="mt-8 rounded-2xl bg-cream px-5 py-4 text-center text-base text-charcoal-deep sm:text-lg">
                Everyone is welcome here. Come as you are, and share what feels
                right.
              </p>
            </div>
          </div>
        </section>

        {/* Join */}
        <section className={`${wrap} py-24 sm:py-32`}>
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
            {/* Decorative orbit background: faded, non-interactive, hidden from assistive tech */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 z-0 select-none opacity-30"
            >
              <div className="origin-top scale-110 sm:scale-125">
                <CommunityOrbit items={ORBIT_ITEMS} minScale={0.55} />
              </div>
            </div>
            <div className="relative z-10 mx-auto max-w-2xl">
              <h2 className="text-3xl font-semibold leading-[1.12] tracking-tight text-white sm:text-5xl">
                There&apos;s a place for <span className="text-bless">you</span> here.
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">
                Join a community that believes kindness grows when we share it.
              </p>
              <JoinCommunityButton
                className={`mt-9 inline-flex h-14 items-center justify-center rounded-xl bg-bless px-8 text-base font-semibold text-charcoal-deep shadow-sm transition hover:bg-bless-deep active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-charcoal-deep`}
              />
            </div>
          </div>
        </section>
      </main>
    </JoinCommunityProvider>
  );
}
