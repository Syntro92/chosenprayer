import Link from "next/link";
import type { ReactNode } from "react";

const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-charcoal-deep focus-visible:ring-offset-2";

const primaryBtn = `inline-flex h-12 items-center justify-center rounded-xl bg-bless px-6 text-sm font-semibold text-charcoal-deep shadow-sm transition hover:bg-bless-deep active:scale-[0.98] ${focus}`;

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-bless-deep">
      {children}
    </span>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <h2 className="mt-4 text-3xl font-semibold leading-[1.1] tracking-tight text-charcoal-deep sm:text-4xl lg:text-5xl">
      {children}
    </h2>
  );
}

const wrap = "mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-10";

/* ---------- 01 Introduction ---------- */
export function Introduction() {
  return (
    <section className="bg-white py-24 sm:py-32">
      <div className={`${wrap} flex max-w-3xl flex-col items-center text-center`}>
        <Eyebrow>How Chosen Bless works</Eyebrow>
        <Heading>
          Find something meaningful.
          <br />
          Support it.
        </Heading>
        <p className="mt-6 text-base leading-relaxed text-slate sm:text-lg">
          Chosen Bless connects you with channels, creators and voices that
          bring value to people&apos;s lives. Discover their work, choose who
          you want to support, and give what feels right.
        </p>
      </div>
    </section>
  );
}

/* ---------- 02 How it works ---------- */
const iconProps = {
  width: 44,
  height: 44,
  viewBox: "0 0 44 44",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const STEPS = [
  {
    n: "01",
    title: "Discover",
    text: "Explore channels and discover people whose work inspires, encourages or connects with you.",
    icon: (
      <svg {...iconProps}>
        <circle cx="19" cy="19" r="11" />
        <path d="m27.5 27.5 9 9" />
        <path d="M14.5 19.5c1.5 2.5 7.5 2.5 9 0" />
        <circle cx="15.5" cy="15.5" r=".8" fill="currentColor" />
        <circle cx="22.5" cy="15.5" r=".8" fill="currentColor" />
      </svg>
    ),
  },
  {
    n: "02",
    title: "Connect",
    text: "Visit their profile, learn about their work and see what the community is saying.",
    icon: (
      <svg {...iconProps}>
        <circle cx="15" cy="16" r="5" />
        <path d="M6 33c0-5 4-8 9-8s9 3 9 8" />
        <path d="M27 11h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4l-4 4v-4h-2a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" />
      </svg>
    ),
  },
  {
    n: "03",
    title: "Support",
    text: "Choose a one-time or monthly contribution and support the work you believe in.",
    icon: (
      <svg {...iconProps}>
        <path d="M22 36S7 27.5 7 16.5A8 8 0 0 1 22 12a8 8 0 0 1 15 4.500C37 27.500 22 36 22 36Z" />
      </svg>
    ),
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-white pb-24 sm:pb-32">
      <div className={wrap}>
        <ol className="grid gap-6 md:grid-cols-3 md:gap-8">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className="relative rounded-[14px] border border-line bg-white p-8 transition-colors hover:border-charcoal-deep/20"
            >
              <span className="absolute right-6 top-6 text-xs font-medium tracking-widest text-slate">
                {s.n} / 03
              </span>
              <div className="flex size-16 items-center justify-center rounded-full bg-cream text-charcoal-deep">
                {s.icon}
              </div>
              <h3 className="mt-8 text-sm font-semibold uppercase tracking-[0.18em] text-charcoal-deep">
                {s.title}
              </h3>
              <p className="mt-3 leading-relaxed text-slate">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------- 03 Explore channels ---------- */
const CHANNELS = [
  {
    name: "Noble Soul",
    handle: "@NobleSoul111",
    text: "The words you need, when you need them.",
    followers: "12.4K",
    supporters: "318",
    cover: "from-cream via-[#FFEBA8] to-bless/60",
    initial: "N",
  },
  {
    name: "The Guiding Light",
    handle: "@GuidingLight",
    text: "Thoughts, reflections and moments of encouragement.",
    followers: "8.9K",
    supporters: "204",
    cover: "from-mist via-[#D9E6DE] to-sage/60",
    initial: "G",
  },
];

function CoverArt() {
  // Abstract line-drawn horizon in the same black-and-white pen style.
  return (
    <svg
      viewBox="0 0 400 160"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 size-full text-charcoal-deep/25"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="300" cy="50" r="22" />
      <path d="M0 130c60-30 110-30 170 0s120 30 230-10" />
      <path d="M0 148c70-24 130-24 190 0s130 20 210-6" />
    </svg>
  );
}

export function ExploreChannels() {
  return (
    <section id="channels" className="bg-white pb-24 sm:pb-32">
      <div className={wrap}>
        <div className="mx-auto max-w-2xl text-center">
          <Heading>Voices worth supporting.</Heading>
          <p className="mt-5 text-base leading-relaxed text-slate sm:text-lg">
            Discover channels from people creating, sharing and inspiring every
            day.
          </p>
        </div>

        <div className="mt-14 grid gap-8 md:grid-cols-2">
          {CHANNELS.map((c) => (
            <article
              key={c.handle}
              className="group overflow-hidden rounded-[20px] border border-line bg-white shadow-[0_1px_2px_rgba(23,25,24,0.04)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-18px_rgba(23,25,24,0.25)]"
            >
              <div
                className={`relative h-44 bg-gradient-to-br sm:h-52 ${c.cover}`}
              >
                <CoverArt />
              </div>
              <div className="relative px-7 pb-7">
                <div className="-mt-10 flex size-20 items-center justify-center rounded-full border-4 border-white bg-charcoal-deep text-2xl font-semibold text-bless">
                  {c.initial}
                </div>
                <h3 className="mt-4 text-xl font-semibold tracking-tight text-charcoal-deep">
                  {c.name}
                </h3>
                <p className="text-sm text-slate">{c.handle}</p>
                <p className="mt-3 leading-relaxed text-charcoal-deep/80">
                  {c.text}
                </p>
                <div className="mt-6 flex items-center justify-between gap-4 border-t border-line pt-5">
                  <dl className="flex gap-6 text-sm">
                    <div>
                      <dt className="text-slate">Followers</dt>
                      <dd className="font-semibold text-charcoal-deep">
                        {c.followers}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate">Supporters</dt>
                      <dd className="font-semibold text-charcoal-deep">
                        {c.supporters}
                      </dd>
                    </div>
                  </dl>
                  <Link
                    href={`/channels/${c.handle.slice(1)}`}
                    className={`shrink-0 whitespace-nowrap rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-charcoal-deep transition-colors hover:bg-mist ${focus}`}
                  >
                    View Channel
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-12 flex justify-center">
          <Link href="/channels" className={primaryBtn}>
            Explore All Channels
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ---------- 04 Community ---------- */
const MESSAGES = [
  {
    text: "Your words helped me through a difficult time. Thank you for continuing this work.",
    by: "Sarah",
    tone: "bg-cream",
    offset: "md:mt-0",
  },
  {
    text: "Keep going. What you're creating matters.",
    by: "Anonymous",
    tone: "bg-white",
    offset: "md:mt-10",
  },
  {
    text: "Your message found me exactly when I needed it.",
    by: "Daniel",
    tone: "bg-mist",
    offset: "md:mt-4",
  },
];

// Placeholder until wired to real data.
const BLESSINGS_SHARED = "1,284";

export function Community() {
  return (
    <section className="bg-white pb-24 sm:pb-32">
      <div className={wrap}>
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>From the community</Eyebrow>
          <Heading>Support is more than a transaction.</Heading>
          <p className="mt-5 text-base leading-relaxed text-slate sm:text-lg">
            Sometimes a few words mean just as much as a contribution.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3 md:items-start">
          {MESSAGES.map((m) => (
            <figure
              key={m.by}
              className={`rounded-[20px] border border-line p-8 ${m.tone} ${m.offset}`}
            >
              <svg
                width="28"
                height="22"
                viewBox="0 0 28 22"
                className="text-bless"
                fill="currentColor"
                aria-hidden
              >
                <path d="M0 22V11C0 4.5 3.500.8 10 0v4c-3 .6-4.500 2.400-4.500 5H10v13H0Zm16 0V11c0-6.500 3.500-10.200 10-11v4c-3 .6-4.500 2.400-4.500 5H26v13H16Z" />
              </svg>
              <blockquote className="mt-5 text-lg leading-relaxed text-charcoal-deep">
                {m.text}
              </blockquote>
              <figcaption className="mt-6 text-sm font-medium text-slate">
                — {m.by}
              </figcaption>
            </figure>
          ))}
        </div>

        <p className="mt-12 text-center text-sm text-slate">
          <span className="font-semibold text-charcoal-deep">
            {BLESSINGS_SHARED}
          </span>{" "}
          blessings shared
        </p>
      </div>
    </section>
  );
}

/* ---------- 05 Why Chosen Bless ---------- */
const PRINCIPLES = [
  {
    title: "Voluntary",
    text: "Give what feels right. There is no pressure.",
    icon: (
      <svg {...iconProps}>
        <path d="M8 24c4-6 8-9 13-9h8l7-5v22l-7-5h-6" />
        <path d="M8 24l6 8" />
      </svg>
    ),
  },
  {
    title: "Direct",
    text: "Support the channels and people you personally choose.",
    icon: (
      <svg {...iconProps}>
        <path d="M8 22h26" />
        <path d="m26 13 9 9-9 9" />
      </svg>
    ),
  },
  {
    title: "Meaningful",
    text: "Your contribution helps creators continue the work that matters to their community.",
    icon: (
      <svg {...iconProps}>
        <path d="M22 7v6M22 31v6M7 22h6M31 22h6M12 12l4 4M28 28l4 4M32 12l-4 4M16 28l-4 4" />
        <circle cx="22" cy="22" r="4" />
      </svg>
    ),
  },
];

export function WhyChosenBless() {
  return (
    <section className="bg-mist py-24 sm:py-32">
      <div className={wrap}>
        <div className="mx-auto max-w-2xl text-center">
          <Heading>Give because it matters to you.</Heading>
        </div>
        <div className="mt-16 grid gap-10 md:grid-cols-3 md:gap-12">
          {PRINCIPLES.map((p) => (
            <div key={p.title} className="text-center md:text-left">
              <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-white text-charcoal-deep md:mx-0">
                {p.icon}
              </div>
              <h3 className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-charcoal-deep">
                {p.title}
              </h3>
              <p className="mt-3 leading-relaxed text-slate">{p.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- 06 Final CTA ---------- */
function HandDrawnHeart() {
  return (
    <svg
      width="72"
      height="64"
      viewBox="0 0 72 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-charcoal-deep"
      aria-hidden
    >
      <path d="M36 56C14 42 6 30 8 20 10 10 24 6 32 16c2 2.500 3 4 4 4s2-1.500 4-4c8-10 22-6 24 4 2 10-6 22-28 36Z" />
      <path d="M20 24c1-3 4-5 7-5" />
      <path d="M58 6l4-4M64 14l5-2M52 2l1-3" />
    </svg>
  );
}

export function FinalCta() {
  return (
    <section className="bg-white py-24 sm:py-32">
      <div className={`${wrap} flex max-w-3xl flex-col items-center text-center`}>
        <HandDrawnHeart />
        <Heading>Found something worth supporting?</Heading>
        <p className="mt-5 text-base leading-relaxed text-slate sm:text-lg">
          Explore the community and find a channel that means something to you.
        </p>
        <div className="mt-9 flex flex-col items-center gap-5 sm:flex-row sm:gap-8">
          <Link href="/channels" className={primaryBtn}>
            Explore Channels
          </Link>
          <Link
            href="/how-it-works"
            className={`rounded-lg text-sm font-semibold text-charcoal-deep underline-offset-4 hover:underline ${focus}`}
          >
            How it works →
          </Link>
        </div>
      </div>
    </section>
  );
}
