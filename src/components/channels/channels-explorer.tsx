"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import {
  CATEGORIES,
  CHANNELS,
  formatFollowers,
  formatSupporters,
  type Channel,
} from "@/lib/channels";
import { CoverArt, EmptyIllustration, TONE_CLASS } from "./illustrations";

const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-charcoal-deep focus-visible:ring-offset-2";
const primaryBtn = `inline-flex h-12 items-center justify-center rounded-xl bg-bless px-6 text-sm font-semibold text-charcoal-deep shadow-sm transition hover:bg-bless-deep active:scale-[0.98] ${focus}`;
const wrap = "mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-10";

const PAGE_SIZE = 6;

type Scope = "all" | "large" | "growing";
type Sort = "popular" | "newest" | "name";

const SCOPES: { value: Scope; label: string }[] = [
  { value: "all", label: "All Channels" },
  { value: "large", label: "10K+ followers" },
  { value: "growing", label: "Growing communities" },
];
const SORTS: { value: Sort; label: string }[] = [
  { value: "popular", label: "Popular" },
  { value: "newest", label: "Newest" },
  { value: "name", label: "A to Z" },
];

function Avatar({ name, className }: { name: string; className: string }) {
  return (
    <div
      aria-hidden
      className={`relative z-10 flex shrink-0 items-center justify-center rounded-full border-4 border-white bg-charcoal-deep font-semibold text-bless ${className}`}
    >
      {name.charAt(0)}
    </div>
  );
}

function Stats({ channel }: { channel: Channel }) {
  return (
    <dl className="flex gap-6 text-sm">
      <div>
        <dd className="font-semibold text-charcoal-deep">
          {formatFollowers(channel.followers)}
        </dd>
        <dt className="text-slate">followers</dt>
      </div>
      <div>
        <dd className="font-semibold text-charcoal-deep">
          {formatSupporters(channel.supporters)}
        </dd>
        <dt className="text-slate">supporters</dt>
      </div>
    </dl>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const id = useId();
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-11 w-full cursor-pointer appearance-none rounded-xl border border-line bg-white pl-4 pr-10 text-sm font-medium text-charcoal-deep transition-colors hover:border-charcoal-deep/30 ${focus}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden
        className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate"
      >
        <path
          d="M2.5 4.5 6 8l3.5-3.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function ChannelCard({ channel }: { channel: Channel }) {
  return (
    <article className="group relative flex w-full flex-col overflow-hidden rounded-[18px] border border-line bg-white shadow-[0_1px_2px_rgba(23,25,24,0.04)] transition duration-300 hover:-translate-y-1 hover:border-charcoal-deep/25 hover:shadow-[0_18px_36px_-20px_rgba(23,25,24,0.28)] motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <div className="relative h-36 overflow-hidden">
        <div
          className={`absolute inset-0 bg-gradient-to-br transition-transform duration-500 ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100 ${TONE_CLASS[channel.cover.tone]}`}
        >
          <CoverArt scene={channel.cover.scene} />
        </div>
      </div>
      <div className="flex flex-1 flex-col px-6 pb-6">
        <Avatar name={channel.name} className="-mt-9 size-[72px] text-2xl" />
        <h3 className="mt-4 text-xl font-semibold tracking-tight text-charcoal-deep">
          {channel.name}
        </h3>
        <p className="text-sm text-slate">@{channel.handle}</p>
        <p className="mt-3 flex-1 leading-relaxed text-charcoal-deep/80">
          {channel.description}
        </p>
        <div className="mt-6 flex items-end justify-between gap-4 border-t border-line pt-5">
          <Stats channel={channel} />
          <Link
            href={`/channels/${channel.handle}`}
            aria-label={`View ${channel.name} channel`}
            className={`shrink-0 whitespace-nowrap rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-charcoal-deep transition-colors after:absolute after:inset-0 group-hover:border-charcoal-deep group-hover:bg-charcoal-deep group-hover:text-white ${focus}`}
          >
            View Channel
          </Link>
        </div>
      </div>
    </article>
  );
}

function FeaturedChannel({ channel }: { channel: Channel }) {
  return (
    <section aria-labelledby="featured-label" className={wrap}>
      <span
        id="featured-label"
        className="text-xs font-semibold uppercase tracking-[0.2em] text-bless-deep"
      >
        Featured
      </span>
      <article className="group mt-4 grid overflow-hidden rounded-[22px] border border-line bg-white shadow-[0_1px_2px_rgba(23,25,24,0.04)] transition duration-300 hover:border-charcoal-deep/25 hover:shadow-[0_24px_48px_-24px_rgba(23,25,24,0.28)] md:grid-cols-[1.1fr_1fr]">
        <div className="relative h-56 overflow-hidden md:h-auto md:min-h-[360px]">
          <div
            className={`absolute inset-0 bg-gradient-to-br transition-transform duration-700 ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100 ${TONE_CLASS[channel.cover.tone]}`}
          >
            <CoverArt scene={channel.cover.scene} />
          </div>
        </div>
        <div className="flex flex-col justify-center px-6 pb-8 sm:px-10 md:py-12">
          <Avatar
            name={channel.name}
            className="-mt-10 size-20 text-3xl md:mt-0 md:size-24 md:text-4xl"
          />
          <h3 className="mt-5 text-3xl font-semibold tracking-tight text-charcoal-deep sm:text-4xl">
            {channel.name}
          </h3>
          <p className="mt-1 text-sm text-slate">@{channel.handle}</p>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-charcoal-deep/85">
            &ldquo;{channel.description}&rdquo;
          </p>
          <div className="mt-6">
            <Stats channel={channel} />
          </div>
          <div className="mt-8">
            <Link
              href={`/channels/${channel.handle}`}
              aria-label={`View ${channel.name} channel`}
              className={primaryBtn}
            >
              View Channel
            </Link>
          </div>
        </div>
      </article>
    </section>
  );
}

export function ChannelsExplorer() {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [sort, setSort] = useState<Sort>("popular");
  const [category, setCategory] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const searchId = useId();

  const filtering = query.trim() !== "" || scope !== "all" || category !== "all";
  const featured = CHANNELS.find((c) => c.featured);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CHANNELS.filter((c) => {
      // The featured channel has its own section while browsing.
      if (!filtering && c.featured) return false;
      if (category !== "all" && c.category !== category) return false;
      if (scope === "large" && c.followers < 10000) return false;
      if (scope === "growing" && c.followers >= 10000) return false;
      if (!q) return true;
      return [c.name, c.handle, c.description, c.category].some((f) =>
        f.toLowerCase().includes(q),
      );
    }).sort((a, b) => {
      if (sort === "newest") return b.createdAt.localeCompare(a.createdAt);
      if (sort === "name") return a.name.localeCompare(b.name);
      return b.followers - a.followers;
    });
  }, [query, scope, sort, category, filtering]);

  const shown = results.slice(0, visible);
  const activeFilterCount =
    (scope !== "all" ? 1 : 0) +
    (category !== "all" ? 1 : 0) +
    (sort !== "popular" ? 1 : 0);

  // Any change to the inputs restarts the "load more" window.
  const update = (fn: () => void) => {
    fn();
    setVisible(PAGE_SIZE);
  };
  const reset = () =>
    update(() => {
      setQuery("");
      setScope("all");
      setSort("popular");
      setCategory("all");
    });

  const filterControls = (
    <>
      <Select
        label="Show"
        value={scope}
        onChange={(v) => update(() => setScope(v as Scope))}
        options={SCOPES}
      />
      <Select
        label="Sort by"
        value={sort}
        onChange={(v) => update(() => setSort(v as Sort))}
        options={SORTS}
      />
      <Select
        label="Category"
        value={category}
        onChange={(v) => update(() => setCategory(v))}
        options={[
          { value: "all", label: "Category" },
          ...CATEGORIES.map((c) => ({ value: c, label: c })),
        ]}
      />
    </>
  );

  return (
    <>
      {/* Search & filters */}
      <div className={`${wrap} max-w-4xl`}>
        <div role="search" className="flex flex-col gap-3">
          <div className="relative">
            <label htmlFor={searchId} className="sr-only">
              Search channels, creators or topics
            </label>
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden
              className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-slate"
            >
              <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
              <path d="m13.5 13.5 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(e) => update(() => setQuery(e.target.value))}
              placeholder="Search channels..."
              className={`h-14 w-full rounded-2xl border border-line bg-white pl-14 pr-5 text-base text-charcoal-deep shadow-[0_1px_2px_rgba(23,25,24,0.04)] transition-colors placeholder:text-slate/70 hover:border-charcoal-deep/30 ${focus}`}
            />
          </div>

          {/* Desktop / tablet filters */}
          <div className="hidden gap-3 sm:grid sm:grid-cols-3">
            {filterControls}
          </div>

          {/* Mobile: one compact Filters button */}
          <div className="sm:hidden">
            <button
              type="button"
              aria-expanded={filtersOpen}
              aria-controls="mobile-filters"
              onClick={() => setFiltersOpen((o) => !o)}
              className={`flex h-11 w-full items-center justify-between rounded-xl border border-line bg-white px-4 text-sm font-medium text-charcoal-deep ${focus}`}
            >
              <span>
                Filters
                {activeFilterCount > 0 && (
                  <span className="ml-2 rounded-full bg-cream px-2 py-0.5 text-xs">
                    {activeFilterCount}
                  </span>
                )}
              </span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                aria-hidden
                className={`text-slate transition-transform duration-200 ${filtersOpen ? "rotate-180" : ""}`}
              >
                <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div id="mobile-filters" hidden={!filtersOpen} className="mt-3 grid gap-3">
              {filterControls}
            </div>
          </div>
        </div>
      </div>

      {/* Featured */}
      {!filtering && featured && (
        <div className="mt-16 sm:mt-20">
          <FeaturedChannel channel={featured} />
        </div>
      )}

      {/* Grid */}
      <section
        aria-labelledby="explore-heading"
        className={`${wrap} ${filtering ? "mt-14" : "mt-24 sm:mt-32"}`}
      >
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="explore-heading"
            className="text-3xl font-semibold leading-[1.1] tracking-tight text-charcoal-deep sm:text-4xl"
          >
            Explore channels
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate sm:text-lg">
            Find a voice, creator or community that means something to you.
          </p>
        </div>

        <p aria-live="polite" className="sr-only">
          {results.length} {results.length === 1 ? "channel" : "channels"} found
        </p>

        {results.length > 0 ? (
          <>
            <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
              {shown.map((c) => (
                <li key={c.handle} className="flex">
                  <ChannelCard channel={c} />
                </li>
              ))}
            </ul>
            {results.length > visible && (
              <div className="mt-14 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisible((v) => v + PAGE_SIZE)}
                  className={`inline-flex h-12 items-center justify-center rounded-xl border border-charcoal-deep/20 bg-white px-7 text-sm font-semibold text-charcoal-deep transition hover:border-charcoal-deep hover:bg-mist active:scale-[0.98] ${focus}`}
                >
                  Load More Channels
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="mx-auto mt-12 max-w-md rounded-[22px] border border-dashed border-line bg-white px-6 py-14 text-center">
            <EmptyIllustration />
            <h3 className="mt-8 text-2xl font-semibold tracking-tight text-charcoal-deep">
              Nothing found yet.
            </h3>
            <p className="mt-2 text-slate">
              Try another name, topic or category.
            </p>
            <button type="button" onClick={reset} className={`mt-7 ${primaryBtn}`}>
              Clear Search
            </button>
          </div>
        )}
      </section>
    </>
  );
}
