"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatDate,
  formatFollowers,
  formatSupporters,
  type Channel,
  type ChannelProfileData,
  type Blessing,
} from "@/lib/channels";
import { OriginButton } from "@/components/ui/origin-button";
import { CoverArt, CrowdIllustration, TONE_CLASS } from "./illustrations";

const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-charcoal-deep focus-visible:ring-offset-2";
const ghostBtn = `inline-flex h-12 items-center justify-center rounded-xl border border-line bg-white px-5 text-sm font-semibold text-charcoal-deep transition hover:border-charcoal-deep/40 active:scale-[0.98] ${focus}`;
const card =
  "rounded-[18px] border border-line bg-white shadow-[0_1px_2px_rgba(23,25,24,0.04)]";
const eyebrow =
  "text-xs font-semibold uppercase tracking-[0.2em] text-bless-deep";
const h2 =
  "mt-3 text-3xl font-semibold leading-[1.1] tracking-tight text-charcoal-deep sm:text-4xl";

const PRESETS = [11, 25, 55, 111, 555] as const;
type Frequency = "once" | "monthly";
type Amount = number | "custom";

type Support = {
  frequency: Frequency;
  amount: Amount;
  custom: string;
};

const resolveAmount = (s: Support) =>
  s.amount === "custom" ? Math.floor(Number(s.custom)) || 0 : s.amount;

const money = (n: number) => `$${n.toLocaleString("en")}`;

function Heart({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 21s-7.5-4.6-9.6-9.4C.9 8.2 2.7 4.5 6.3 4.5c2.1 0 3.7 1.1 4.7 2.6 1-1.5 2.6-2.6 4.7-2.6 3.600 0 5.400 3.700 3.900 7.100C19.500 16.400 12 21 12 21Z" />
    </svg>
  );
}

function Avatar({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={`relative z-10 flex shrink-0 items-center justify-center rounded-full border-4 border-white bg-charcoal-deep font-semibold text-bless ${className}`}
    >
      {name.charAt(0)}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Support form (used by the sticky card and inside the modal)         */
/* ------------------------------------------------------------------ */

function SupportForm({
  channel,
  value,
  onChange,
  onContinue,
  compact,
}: {
  channel: Channel;
  value: Support;
  onChange: (next: Support) => void;
  onContinue: () => void;
  compact?: boolean;
}) {
  const amount = resolveAmount(value);
  const ready = amount >= 1;
  const set = (patch: Partial<Support>) => onChange({ ...value, ...patch });

  const chip = (selected: boolean) =>
    `h-12 rounded-xl border text-sm font-semibold transition active:scale-[0.97] ${focus} ${
      selected
        ? "border-bless bg-bless text-charcoal-deep shadow-sm"
        : "border-line bg-white text-charcoal-deep hover:border-charcoal-deep/40"
    }`;

  return (
    <div>
      {!compact && (
        <>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            Support {channel.name}
          </p>
          <p className="mt-3 leading-relaxed text-charcoal-deep/85">
            If this channel has brought something meaningful to your life, you
            can give something back.
          </p>
        </>
      )}

      <div
        role="radiogroup"
        aria-label="Frequency"
        className={`grid grid-cols-2 gap-1 rounded-xl bg-mist p-1 ${compact ? "" : "mt-5"}`}
      >
        {(
          [
            ["once", "One-time"],
            ["monthly", "Monthly"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={value.frequency === key}
            onClick={() => set({ frequency: key })}
            className={`h-10 rounded-lg text-sm font-semibold transition ${focus} ${
              value.frequency === key
                ? "bg-white text-charcoal-deep shadow-sm"
                : "text-slate hover:text-charcoal-deep"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        role="radiogroup"
        aria-label="Amount"
        className="mt-4 grid grid-cols-4 gap-2"
      >
        {PRESETS.slice(0, 4).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value.amount === n}
            onClick={() => set({ amount: n })}
            className={chip(value.amount === n)}
          >
            ${n}
          </button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          role="radio"
          aria-checked={value.amount === 555}
          onClick={() => set({ amount: 555 })}
          className={chip(value.amount === 555)}
        >
          $555
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={value.amount === "custom"}
          onClick={() => set({ amount: "custom" })}
          className={chip(value.amount === "custom")}
        >
          Custom
        </button>
      </div>

      {value.amount === "custom" && (
        <label className="mt-3 flex h-12 items-center gap-2 rounded-xl border border-charcoal-deep/30 bg-white px-4 focus-within:ring-2 focus-within:ring-charcoal-deep focus-within:ring-offset-2">
          <span className="font-semibold text-slate">$</span>
          <span className="sr-only">Custom amount in dollars</span>
          <input
            autoFocus
            inputMode="numeric"
            value={value.custom}
            onChange={(e) =>
              set({ custom: e.target.value.replace(/\D/g, "").slice(0, 6) })
            }
            placeholder="Enter amount"
            className="w-full bg-transparent text-sm font-semibold text-charcoal-deep outline-none placeholder:font-normal placeholder:text-slate/70"
          />
        </label>
      )}

      <OriginButton
        type="button"
        disabled={!ready}
        onClick={onContinue}
        className="mt-5 w-full"
      >
        {ready
          ? `Continue · ${money(amount)}${value.frequency === "monthly" ? "/mo" : ""}`
          : "Continue"}
      </OriginButton>

      <p className="mt-4 text-center text-sm text-slate">
        Your contribution is voluntary.
        <br />
        Secure payment.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Support modal: choose → confirm → success                           */
/* ------------------------------------------------------------------ */

type Step = "choose" | "confirm" | "success";

function SupportModal({
  channel,
  value,
  onChange,
  onClose,
  onBlessing,
}: {
  channel: Channel;
  value: Support;
  onChange: (next: Support) => void;
  onClose: () => void;
  onBlessing: (message: string) => void;
}) {
  const [step, setStep] = useState<Step>("choose");
  const [writing, setWriting] = useState(false);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const amount = resolveAmount(value);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // Placeholder for the real payment call.
  const pay = () => {
    setBusy(true);
    window.setTimeout(() => {
      setBusy(false);
      setStep("success");
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-charcoal-deep/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Support ${channel.name}`}
        tabIndex={-1}
        className="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-[24px] bg-white p-6 shadow-2xl outline-none sm:max-w-md sm:rounded-[24px] sm:p-8"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className={`absolute right-4 top-4 flex size-9 items-center justify-center rounded-full text-slate transition hover:bg-mist hover:text-charcoal-deep ${focus}`}
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>

        {step === "choose" && (
          <>
            <h2 className="pr-8 text-2xl font-semibold tracking-tight text-charcoal-deep">
              Support {channel.name}
            </h2>
            <p className="mb-5 mt-2 text-sm leading-relaxed text-slate">
              Choose what feels right. Every amount is appreciated.
            </p>
            <SupportForm
              channel={channel}
              value={value}
              onChange={onChange}
              onContinue={() => setStep("confirm")}
              compact
            />
          </>
        )}

        {step === "confirm" && (
          <>
            <h2 className="pr-8 text-2xl font-semibold tracking-tight text-charcoal-deep">
              Review your support
            </h2>
            <dl className="mt-6 divide-y divide-line rounded-xl border border-line text-sm">
              {[
                ["Channel", channel.name],
                ["Amount", money(amount)],
                ["Frequency", value.frequency === "monthly" ? "Monthly" : "One-time"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between px-4 py-3">
                  <dt className="text-slate">{k}</dt>
                  <dd className="font-semibold text-charcoal-deep">{v}</dd>
                </div>
              ))}
            </dl>
            {/* Payment provider fields mount here. */}
            <p className="mt-4 text-sm text-slate">
              Your contribution is voluntary. Secure payment.
            </p>
            <OriginButton
              type="button"
              onClick={pay}
              disabled={busy}
              className="mt-5 w-full"
            >
              {busy ? "Sending…" : `Send ${money(amount)}`}
            </OriginButton>
            <button
              type="button"
              onClick={() => setStep("choose")}
              className={`mt-2 h-10 w-full rounded-xl text-sm font-medium text-slate transition hover:text-charcoal-deep ${focus}`}
            >
              Back
            </button>
          </>
        )}

        {step === "success" && (
          <div className="text-center">
            <div className="mx-auto -mt-1 mb-2 w-44">
              <CrowdIllustration size="small" className="w-full" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-charcoal-deep sm:text-3xl">
              Your blessing has been sent.
            </h2>
            <p className="mt-3 text-slate">
              Thank you for supporting {channel.name}.
            </p>

            {sent ? (
              <p className="mt-6 rounded-xl bg-cream px-4 py-3 text-sm text-charcoal-deep">
                Your message has been shared with the community.
              </p>
            ) : writing ? (
              <form
                className="mt-6 text-left"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!message.trim()) return;
                  onBlessing(message.trim());
                  setSent(true);
                }}
              >
                <label htmlFor="blessing" className="text-sm font-semibold text-charcoal-deep">
                  Your message
                </label>
                <textarea
                  id="blessing"
                  autoFocus
                  rows={3}
                  maxLength={240}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Say something kind…"
                  className={`mt-2 w-full resize-none rounded-xl border border-line p-3 text-sm text-charcoal-deep placeholder:text-slate/70 ${focus}`}
                />
                <OriginButton type="submit" className="mt-3 w-full">
                  Share Blessing
                </OriginButton>
              </form>
            ) : (
              <>
                <p className="mt-6 text-sm text-charcoal-deep/80">
                  Would you like to leave a message?
                </p>
                <OriginButton
                  type="button"
                  onClick={() => setWriting(true)}
                  className="mt-3 w-full"
                >
                  Leave a Blessing
                </OriginButton>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className={`${ghostBtn} mt-2 w-full`}
            >
              Continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page sections                                                       */
/* ------------------------------------------------------------------ */

const SECTIONS = [
  { id: "about", label: "About" },
  { id: "content", label: "Content" },
  { id: "blessings", label: "Blessings" },
] as const;

function TabBar() {
  const [active, setActive] = useState<string>("about");

  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(
      (e): e is HTMLElement => !!e,
    );
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting);
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);

  return (
    <nav
      aria-label="Channel sections"
      className="sticky top-0 z-30 -mx-4 mt-10 border-b border-line bg-ivory/90 px-4 backdrop-blur sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0"
    >
      <ul className="flex gap-8">
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              aria-current={active === s.id ? "true" : undefined}
              onClick={() => setActive(s.id)}
              className={`-mb-px inline-flex h-12 items-center border-b-2 text-sm font-semibold transition-colors ${focus} ${
                active === s.id
                  ? "border-bless text-charcoal-deep"
                  : "border-transparent text-slate hover:text-charcoal-deep"
              }`}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function BlessingCard({ b }: { b: Blessing }) {
  const anon = b.name === "Anonymous";
  return (
    <figure className={`${card} flex flex-col p-6`}>
      <blockquote className="flex-1 text-lg leading-relaxed text-charcoal-deep">
        &ldquo;{b.message}&rdquo;
      </blockquote>
      <figcaption className="mt-5 flex items-center gap-3 border-t border-line pt-4">
        <span
          aria-hidden
          className={`flex size-9 items-center justify-center rounded-full text-sm font-semibold ${
            anon ? "bg-mist text-slate" : "bg-cream text-charcoal-deep"
          }`}
        >
          {anon ? "·" : b.name.charAt(0)}
        </span>
        <span className="min-w-0 flex-1 text-sm">
          <span className="block font-semibold text-charcoal-deep">
            {anon ? "Anonymous" : b.name}
          </span>
          <span className="text-slate">{formatDate(b.date)}</span>
        </span>
        {b.amount && (
          <span className="rounded-full bg-cream px-2.5 py-1 text-xs font-semibold text-charcoal-deep">
            {money(b.amount)}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

/** Thumbnail with a play button; loads the player only after a click. */
function YouTubeEmbed({ id, title }: { id: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="relative aspect-[16/10] overflow-hidden bg-charcoal-deep">
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="absolute inset-0 size-full"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`Play video: ${title}`}
          className={`group/play absolute inset-0 ${focus}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
            alt=""
            loading="lazy"
            className="size-full object-cover transition duration-500 group-hover/play:scale-105"
          />
          <span className="absolute inset-0 bg-charcoal-deep/15" />
          <span className="absolute left-1/2 top-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-bless shadow-lg transition group-hover/play:scale-110">
            <svg viewBox="0 0 24 24" className="ml-0.5 size-6 text-charcoal-deep" fill="currentColor" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </button>
      )}
    </div>
  );
}

const HELPS = [
  ["Keep creating", "Helps the channel continue creating and sharing."],
  ["Reach more people", "Supports the time and resources behind the work."],
  ["Build community", "Helps create more meaningful content and conversations."],
] as const;

export function ChannelProfile({
  channel,
  data,
}: {
  channel: Channel;
  data: ChannelProfileData;
}) {
  const [support, setSupport] = useState<Support>({
    frequency: "once",
    amount: 25,
    custom: "",
  });
  const [open, setOpen] = useState(false);
  const [following, setFollowing] = useState(false);
  const [shared, setShared] = useState(false);
  const [blessings, setBlessings] = useState<Blessing[]>(data.blessings);

  // Mobile: the sticky button only appears once the inline support card
  // has been scrolled past (it's above the viewport).
  const mobileSupportRef = useRef<HTMLDivElement>(null);
  const finalCtaRef = useRef<HTMLElement>(null);
  const [pastCard, setPastCard] = useState(false);
  const [ctaVisible, setCtaVisible] = useState(false);
  const showSticky = pastCard && !ctaVisible;

  useEffect(() => {
    const card = mobileSupportRef.current;
    const cta = finalCtaRef.current;
    if (!card || !cta) return;
    const cardIo = new IntersectionObserver(([entry]) => {
      setPastCard(!entry.isIntersecting && entry.boundingClientRect.bottom < 0);
    });
    const ctaIo = new IntersectionObserver(([entry]) =>
      setCtaVisible(entry.isIntersecting),
    );
    cardIo.observe(card);
    ctaIo.observe(cta);
    return () => {
      cardIo.disconnect();
      ctaIo.disconnect();
    };
  }, []);

  const openSupport = () => setOpen(true);
  const closeSupport = useCallback(() => setOpen(false), []);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: channel.name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShared(true);
      window.setTimeout(() => setShared(false), 2000);
    } catch {
      /* user cancelled or clipboard blocked */
    }
  };

  const addBlessing = (message: string) =>
    setBlessings((prev) => [
      {
        id: `new-${prev.length}`,
        name: "Anonymous",
        message,
        date: new Date().toISOString().slice(0, 10),
      },
      ...prev,
    ]);

  return (
    <div>
      {/* Cover */}
      <div className="mx-auto w-full max-w-6xl px-4 pt-24 sm:px-6 lg:px-10">
        <div
          className={`relative h-44 overflow-hidden rounded-[22px] bg-gradient-to-br sm:h-60 lg:h-72 lg:rounded-[28px] ${TONE_CLASS[channel.cover.tone]}`}
        >
          <CoverArt scene={channel.cover.scene} />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-white/30 to-transparent" />
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-6xl gap-x-12 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-10">
        {/* ----- Main column ----- */}
        <div className="min-w-0">
          {/* Identity */}
          <header className="px-1 sm:px-4">
            <Avatar
              name={channel.name}
              className="-mt-12 size-24 text-4xl sm:-mt-14 sm:size-28 sm:text-5xl"
            />
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-3xl font-semibold tracking-tight text-charcoal-deep sm:text-4xl">
                {channel.name}
              </h1>
              {channel.verified && (
                <span
                  title="Verified channel"
                  className="inline-flex items-center gap-1 rounded-full bg-cream px-2.5 py-1 text-xs font-semibold text-charcoal-deep"
                >
                  <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m4.500 10.500 3.500 3.500 7.500-8" />
                  </svg>
                  Verified
                </span>
              )}
            </div>
            <p className="mt-1 text-slate">@{channel.handle}</p>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-charcoal-deep/85">
              {channel.description}
            </p>

            <dl className="mt-7 flex gap-8 sm:gap-12">
              {[
                [formatFollowers(channel.followers), "Followers"],
                [formatSupporters(channel.supporters), "Supporters"],
                [formatFollowers(data.blessingsCount), "Blessings"],
              ].map(([n, label]) => (
                <div key={label}>
                  <dd className="text-2xl font-semibold tracking-tight text-charcoal-deep">
                    {n}
                  </dd>
                  <dt className="text-sm text-slate">{label}</dt>
                </div>
              ))}
            </dl>

            <div className="mt-7 grid grid-cols-2 gap-3 lg:flex lg:flex-wrap">
              <OriginButton
                type="button"
                onClick={openSupport}
                className="hidden lg:inline-flex"
              >
                <Heart className="size-4" />
                Support This Channel
              </OriginButton>
              <button
                type="button"
                aria-pressed={following}
                onClick={() => setFollowing((f) => !f)}
                className={`inline-flex h-12 items-center justify-center rounded-xl border px-5 text-sm font-semibold transition active:scale-[0.98] ${focus} ${
                  following
                    ? "border-charcoal-deep/20 bg-mist text-charcoal-deep"
                    : "border-charcoal-deep bg-charcoal-deep text-white hover:bg-charcoal-deep/90"
                }`}
              >
                {following ? "Following" : "Follow"}
              </button>
              <button
                type="button"
                onClick={share}
                className={`inline-flex h-12 items-center justify-center rounded-xl border border-bless bg-cream px-5 text-sm font-semibold text-charcoal-deep transition hover:bg-bless/30 active:scale-[0.98] ${focus}`}
              >
                {shared ? "Link copied" : "Share"}
              </button>
            </div>
          </header>

          {/* Inline support card (mobile), above About */}
          <div
            ref={mobileSupportRef}
            className={`${card} mt-10 p-6 shadow-[0_12px_32px_-18px_rgba(23,25,24,0.25)] lg:hidden`}
          >
            <SupportForm
              channel={channel}
              value={support}
              onChange={setSupport}
              onContinue={openSupport}
            />
          </div>

          <TabBar />

          {/* About */}
          <section id="about" className="scroll-mt-16 pt-14">
            <span className={eyebrow}>About</span>
            <h2 className={h2}>About {channel.name}</h2>
            <div className="mt-6 max-w-2xl space-y-5 text-lg leading-[1.75] text-charcoal-deep/85">
              {data.about.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
            <div className="mt-8 max-w-2xl rounded-[18px] bg-cream p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-charcoal-deep/60">
                Mission
              </p>
              <p className="mt-2 text-lg leading-relaxed text-charcoal-deep">
                {data.mission}
              </p>
            </div>
          </section>

          {/* Content */}
          <section id="content" className="scroll-mt-16 pt-20">
            <span className={eyebrow}>Content</span>
            <h2 className={h2}>Latest from {channel.name}</h2>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {data.content.map((c) => (
                <article
                  key={c.id}
                  className={`${card} group overflow-hidden transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_36px_-20px_rgba(23,25,24,0.28)] motion-reduce:transition-none motion-reduce:hover:translate-y-0`}
                >
                  {c.youtubeId ? (
                    <YouTubeEmbed id={c.youtubeId} title={c.title} />
                  ) : (
                    <div
                      className={`relative aspect-[16/10] overflow-hidden bg-gradient-to-br ${TONE_CLASS[c.cover.tone]}`}
                    >
                      <CoverArt scene={c.cover.scene} />
                    </div>
                  )}
                  <div className="p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-bless-deep">
                      {c.kind}
                    </p>
                    <h3 className="mt-2 text-lg font-semibold leading-snug tracking-tight text-charcoal-deep">
                      {c.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate">
                      {c.excerpt}
                    </p>
                    <p className="mt-4 text-xs text-slate">
                      {formatDate(c.date)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
            <div className="mt-8">
              <Link href={`/channels/${channel.handle}/content`} className={ghostBtn}>
                View All Content
              </Link>
            </div>
          </section>

          {/* Community */}
          <section id="blessings" className="scroll-mt-16 pt-20">
            <span className={eyebrow}>From the community</span>
            <h2 className={`${h2} max-w-xl`}>
              Blessings from people who support this work.
            </h2>
            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              {blessings.map((b) => (
                <BlessingCard key={b.id} b={b} />
              ))}
            </div>
            <div className="mt-8">
              <Link href={`/channels/${channel.handle}/blessings`} className={ghostBtn}>
                View All Blessings
              </Link>
            </div>

            <div className="mt-12 overflow-hidden rounded-[22px] border border-line bg-white">
              <div className="px-8 pt-10 text-center sm:px-12">
                <p className="text-2xl font-semibold tracking-tight text-charcoal-deep sm:text-3xl">
                  {formatSupporters(channel.supporters)} people have supported
                  this channel.
                </p>
                <p className="mt-2 text-slate">
                  Together, they&apos;ve shared{" "}
                  {formatSupporters(Math.floor(data.blessingsCount / 100) * 100)}+
                  blessings.
                </p>
              </div>
              <div className="relative mt-4 h-24 overflow-hidden">
                <CrowdIllustration className="absolute -bottom-4 left-1/2 w-[520px] max-w-none -translate-x-1/2" />
              </div>
            </div>
          </section>

          {/* What support means */}
          <section className="pt-20">
            <h2 className="text-2xl font-semibold tracking-tight text-charcoal-deep sm:text-3xl">
              What does my support help with?
            </h2>
            <ul className="mt-8 grid gap-5 sm:grid-cols-3">
              {HELPS.map(([title, text], i) => (
                <li key={title} className="border-t-2 border-charcoal-deep pt-4">
                  <span className="text-xs font-semibold text-slate">
                    0{i + 1}
                  </span>
                  <h3 className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-charcoal-deep">
                    {title}
                  </h3>
                  <p className="mt-2 leading-relaxed text-slate">{text}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* ----- Sticky support card (desktop) ----- */}
        <aside className="hidden lg:block">
          <div className="sticky top-6 mt-6">
            <div className={`${card} p-7 shadow-[0_12px_32px_-18px_rgba(23,25,24,0.25)]`}>
              <SupportForm
                channel={channel}
                value={support}
                onChange={setSupport}
                onContinue={openSupport}
              />
            </div>
          </div>
        </aside>
      </div>

      {/* Final CTA */}
      <section ref={finalCtaRef} className="mt-24 overflow-hidden bg-cream py-20 sm:mt-32 sm:py-28">
        <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center px-4 text-center sm:px-6">
          <h2 className="text-3xl font-semibold leading-[1.1] tracking-tight text-charcoal-deep sm:text-4xl lg:text-5xl">
            Found something meaningful here?
          </h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-charcoal-deep/75 sm:text-lg">
            If this channel has made a difference in your life, consider
            supporting the work.
          </p>
          <OriginButton type="button" onClick={openSupport} className="mt-9">
            <Heart className="size-4" />
            Support This Channel
          </OriginButton>
          <Link
            href="/channels"
            className={`mt-5 text-sm font-semibold text-charcoal-deep underline-offset-4 hover:underline ${focus}`}
          >
            Explore more channels →
          </Link>
          <CrowdIllustration
            size="small"
            className="mt-12 w-64 opacity-80"
          />
        </div>
      </section>

      {/* Mobile sticky CTA */}
      <div
        aria-hidden={!showSticky}
        inert={!showSticky}
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ivory/95 p-3 backdrop-blur transition duration-300 lg:hidden ${
          showSticky
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-full opacity-0"
        }`}
      >
        <OriginButton
          type="button"
          onClick={openSupport}
          className="w-full px-5"
        >
          <span className="flex w-full items-center justify-between">
            <span className="inline-flex items-center gap-2">
              <Heart className="size-4" />
              Support This Channel
            </span>
            <span aria-hidden>→</span>
          </span>
        </OriginButton>
      </div>

      {open && (
        <SupportModal
          channel={channel}
          value={support}
          onChange={setSupport}
          onClose={closeSupport}
          onBlessing={addBlessing}
        />
      )}
    </div>
  );
}
