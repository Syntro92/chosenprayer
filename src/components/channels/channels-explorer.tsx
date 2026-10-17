"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import {
  formatFollowers,
  type Channel,
} from "@/lib/channels";
import { CoverArt, CoverPhoto, EmptyIllustration, TONE_CLASS } from "./illustrations";

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

function Avatar({ name, url, className }: { name: string; url?: string | null; className: string }) {
  return (
    <div
      aria-hidden
      className={`relative z-10 flex shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-charcoal-deep font-semibold text-bless ${className}`}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- served from Supabase Storage's CDN
        <img src={url} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      ) : (
        name.charAt(0)
      )}
    </div>
  );
}

function Stats({ channel }: { channel: Channel }) {
  return (
    <dl className="flex gap-6 text-sm">
      <div>
        <dd className="font-semibold text-charcoal-deep">
          {channel.subscribers == null ? "—" : formatFollowers(channel.subscribers)}
        </dd>
        <dt className="text-slate">subscribers</dt>
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
          {channel.coverUrl ? <CoverPhoto url={channel.coverUrl} /> : <CoverArt scene={channel.cover.scene} />}
        </div>
      </div>
      <div className="flex flex-1 flex-col px-6 pb-6">
        <Avatar name={channel.name} url={channel.avatarUrl} className="-mt-9 size-[72px] text-2xl" />
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
            {channel.coverUrl ? <CoverPhoto url={channel.coverUrl} /> : <CoverArt scene={channel.cover.scene} />}
          </div>
        </div>
        <div className="flex flex-col justify-center px-6 pb-8 sm:px-10 md:py-12">
          <Avatar
            name={channel.name}
            url={channel.avatarUrl}
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

type Category = { slug: string; name: string };
type Page = { items: Channel[]; nextCursor: string | null };
type Filters = { query: string; scope: Scope; sort: Sort; category: string };

const DEFAULT_FILTERS: Filters = { query: "", scope: "all", sort: "popular", category: "all" };

/** Browsing with no filters shows the featured channel separately, so the list leaves it out. */
const isFiltering = (f: Filters) => f.query.trim() !== "" || f.scope !== "all" || f.category !== "all";
/** The server-rendered first page is exactly this view; anything else needs a fetch. */
const isDefaultView = (f: Filters) => !isFiltering(f) && f.sort === "popular";

function buildUrl(f: Filters, cursor?: string | null) {
  const p = new URLSearchParams({ limit: String(PAGE_SIZE), sort: f.sort, scope: f.scope });
  if (f.query.trim()) p.set("q", f.query.trim());
  if (f.category !== "all") p.set("category", f.category);
  if (!isFiltering(f)) p.set("featured", "exclude");
  if (cursor) p.set("cursor", cursor);
  return `/api/channels?${p}`;
}

async function fetchPage(f: Filters, cursor: string | null, signal: AbortSignal): Promise<Page> {
  const res = await fetch(buildUrl(f, cursor), { signal });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

export function ChannelsExplorer({
  categories,
  featured,
  initial,
}: {
  categories: Category[];
  featured: Channel | null;
  initial: Page;
}) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [items, setItems] = useState<Channel[]>(initial.items);
  const [nextCursor, setNextCursor] = useState<string | null>(initial.nextCursor);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inflight = useRef<AbortController | null>(null);
  const searchId = useId();

  const { query, scope, sort, category } = filters;
  const filtering = isFiltering(filters);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      inflight.current?.abort();
    },
    [],
  );

  /** Apply new filters: show the server-rendered page for the default view, otherwise fetch. */
  function apply(next: Filters, delay = 0) {
    setFilters(next);
    clearTimeout(timer.current);
    inflight.current?.abort();
    if (isDefaultView(next)) {
      setItems(initial.items);
      setNextCursor(initial.nextCursor);
      setStatus("idle");
      return;
    }
    setStatus("loading");
    timer.current = setTimeout(async () => {
      const ctrl = new AbortController();
      inflight.current = ctrl;
      try {
        const page = await fetchPage(next, null, ctrl.signal);
        if (ctrl.signal.aborted) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setStatus("idle");
      } catch {
        if (!ctrl.signal.aborted) setStatus("error");
      }
    }, delay);
  }

  async function loadMore() {
    if (!nextCursor || status === "loading") return;
    inflight.current?.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    setStatus("loading");
    try {
      const page = await fetchPage(filters, nextCursor, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setItems((cur) => [...cur, ...page.items]);
      setNextCursor(page.nextCursor);
      setStatus("idle");
    } catch {
      if (!ctrl.signal.aborted) setStatus("error");
    }
  }

  const results = items;
  const activeFilterCount =
    (scope !== "all" ? 1 : 0) +
    (category !== "all" ? 1 : 0) +
    (sort !== "popular" ? 1 : 0);

  const reset = () => apply(DEFAULT_FILTERS);

  const filterControls = (
    <>
      <Select
        label="Show"
        value={scope}
        onChange={(v) => apply({ ...filters, scope: v as Scope })}
        options={SCOPES}
      />
      <Select
        label="Sort by"
        value={sort}
        onChange={(v) => apply({ ...filters, sort: v as Sort })}
        options={SORTS}
      />
      <Select
        label="Category"
        value={category}
        onChange={(v) => apply({ ...filters, category: v })}
        options={[
          { value: "all", label: "Category" },
          ...categories.map((c) => ({ value: c.slug, label: c.name })),
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
              onChange={(e) => apply({ ...filters, query: e.target.value }, 250)}
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
          {status === "loading" ? "Loading channels" : `${results.length}${nextCursor ? "+" : ""} ${results.length === 1 ? "channel" : "channels"} found`}
        </p>

        {results.length > 0 ? (
          <>
            <ul
              aria-busy={status === "loading"}
              className={`mt-12 grid gap-6 transition-opacity sm:grid-cols-2 lg:grid-cols-3 lg:gap-8 ${status === "loading" && items.length > 0 ? "opacity-60" : ""}`}
            >
              {results.map((c) => (
                <li key={c.handle} className="flex">
                  <ChannelCard channel={c} />
                </li>
              ))}
            </ul>
            {status === "error" && (
              <p role="alert" className="mt-8 text-center text-sm text-red-700">
                Couldn&apos;t load channels. Please check your connection and try again.
              </p>
            )}
            {nextCursor && (
              <div className="mt-14 flex justify-center">
                <button
                  type="button"
                  disabled={status === "loading"}
                  onClick={loadMore}
                  className={`inline-flex h-12 items-center justify-center rounded-xl border border-charcoal-deep/20 bg-white px-7 text-sm font-semibold text-charcoal-deep transition hover:border-charcoal-deep hover:bg-mist active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 ${focus}`}
                >
                  {status === "loading" ? "Loading…" : "Load More Channels"}
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
