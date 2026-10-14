"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, Search } from "lucide-react";
import { formatAge } from "@/lib/community/format";
import { useCommunity } from "./community-provider";
import { Composer } from "./composer";
import { PostCard } from "./post-card";
import { Avatar, EmptyState, focus, primaryBtn, secondaryBtn } from "./ui";

type Tab = "feed" | "mine";
type Filter = "latest" | "popular" | "media";

const TABS: { id: Tab; label: string }[] = [
  { id: "feed", label: "Community Feed" },
  { id: "mine", label: "My Posts" },
];
const FILTERS: { id: Filter; label: string }[] = [
  { id: "latest", label: "Latest" },
  { id: "popular", label: "Popular" },
  { id: "media", label: "Images & Files" },
];
function Notifications() {
  const { user, notifications, unreadNotifications, refreshNotifications, markNotificationsRead } = useCommunity();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = useRef(unreadNotifications);
  useEffect(() => {
    unread.current = unreadNotifications;
  }, [unreadNotifications]);

  // Closing the panel is what marks things as read, so the bold "new" styling is visible while it is open.
  const close = () => {
    setOpen(false);
    if (unread.current > 0) void markNotificationsRead();
  };
  const toggle = () => {
    if (open) return close();
    setOpen(true);
    void refreshNotifications();
  };

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
    // close() only reads refs and stable callbacks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={unreadNotifications > 0 ? `Notifications, ${unreadNotifications} unread` : "Notifications"}
        className={`relative flex size-11 items-center justify-center rounded-xl border border-line bg-white text-slate transition-colors hover:border-slate/50 hover:text-charcoal-deep ${focus}`}
      >
        <Bell size={18} aria-hidden />
        {unreadNotifications > 0 && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-bless px-1.5 text-[11px] font-semibold leading-5 text-charcoal-deep"
          >
            {unreadNotifications > 9 ? "9+" : unreadNotifications}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-line bg-white p-2 shadow-lg">
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-slate">Notifications</p>
          {user && notifications.length > 0 ? (
            <ul>
              {notifications.map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.href ?? "/community"}
                    onClick={close}
                    className={`block rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-charcoal-deep/5 ${focus} ${n.read ? "text-slate" : "font-medium text-charcoal-deep"}`}
                  >
                    {!n.read && <span aria-hidden className="mr-2 inline-block size-2 rounded-full bg-bless align-middle" />}
                    {n.text}
                    <span className="block text-xs font-normal text-slate">{formatAge(n.ageMinutes)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-3 text-sm text-slate">Nothing yet. Replies and appreciation on your posts will show up here.</p>
          )}
        </div>
      )}
    </div>
  );
}

function Sidebar() {
  const { isModerator, openReports } = useCommunity();
  return (
    <aside className="space-y-4" aria-label="Community information">
      {isModerator && (
        <section className="rounded-[22px] border border-line bg-white p-5">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-charcoal-deep">Moderation</h2>
          <Link href="/community/moderation" className={`${secondaryBtn} mt-3 h-10 w-full`}>
            Report queue{openReports ? ` (${openReports})` : ""}
          </Link>
        </section>
      )}
      <section className="rounded-[22px] border border-line bg-white p-5">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-charcoal-deep">Community guidelines</h2>
        <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-slate">
          <li>Be kind and encouraging.</li>
          <li>Share what you&apos;re happy for others to see.</li>
          <li>Respect people&apos;s work and privacy.</li>
          <li>Report anything that doesn&apos;t feel right.</li>
        </ul>
      </section>
      <section className="rounded-[22px] border border-line bg-cream p-5">
        <h2 className="text-base font-semibold text-charcoal-deep">Find something worth supporting</h2>
        <p className="mt-2 text-sm leading-relaxed text-charcoal-deep/75">Discover channels and the people behind them.</p>
        <Link href="/channels" className={`${secondaryBtn} mt-4 h-10 w-full`}>Explore Channels</Link>
      </section>
      <p className="px-1 text-sm text-slate">
        New here?{" "}
        <Link href="/community/welcome" className={`rounded font-medium text-charcoal-deep underline underline-offset-4 ${focus}`}>
          Read about the community
        </Link>
      </p>
    </aside>
  );
}

export function CommunityFeed() {
  const { user, posts, feed, loadFeed, loadMoreFeed, requireAuth, setComposerOpen, getMember } = useCommunity();
  const [tab, setTab] = useState<Tab>("feed");
  const [filter, setFilter] = useState<Filter>("latest");
  const [query, setQuery] = useState("");
  const composerRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  /** Filters live on the server: any change fetches a fresh first page (search waits for a pause in typing). */
  const run = (next: { tab: Tab; filter: Filter; query: string }, delay = 0) => {
    setTab(next.tab);
    setFilter(next.filter);
    setQuery(next.query);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void loadFeed({ tab: next.tab, filter: next.filter, q: next.query.trim() || undefined });
    }, delay);
  };

  const shareSomething = () => {
    if (!requireAuth()) return;
    if (tab !== "feed") run({ tab: "feed", filter, query });
    setComposerOpen(true);
    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // The faces next to "Share Something": the distinct authors currently in the feed.
  const voices = Array.from(new Set(posts.map((p) => p.authorId)))
    .slice(0, 5)
    .map((id) => getMember(id))
    .filter((m): m is NonNullable<typeof m> => !!m);

  const visible = posts;
  const loading = feed.status === "loading";

  const chip = (active: boolean) =>
    `rounded-full border px-4 py-2 text-sm font-medium transition-colors ${focus} ${
      active ? "border-charcoal-deep bg-charcoal-deep text-white" : "border-line bg-white text-slate hover:border-slate/50 hover:text-charcoal-deep"
    }`;

  return (
    <main className="bg-ivory">
      {/* Welcome (compact) */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-8 pt-28 sm:px-6 sm:pt-32 lg:px-10">
        <div className="max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-bless-deep">The Chosen Prayer Community</span>
          <h1 className="mt-3 text-4xl font-semibold leading-[1.08] tracking-tight text-charcoal-deep sm:text-5xl">
            A little kindness brings us together.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-slate sm:text-lg">
            Share your moments, celebrate others, and connect with people who believe in making a difference.
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex gap-3">
            <button type="button" onClick={shareSomething} className={primaryBtn}>Share Something</button>
          </div>
          {voices.length > 0 && (
            <div className="flex items-center gap-3">
              <ul className="flex -space-x-2" aria-label="Members sharing recently">
                {voices.map((m) => (
                  <li key={m.id} className="rounded-full ring-2 ring-ivory"><Avatar member={m} size="sm" /></li>
                ))}
              </ul>
              <span className="text-xs text-slate">Recently sharing</span>
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 pb-24 sm:px-6 lg:grid-cols-[minmax(0,720px)_1fr] lg:px-10">
        <div className="min-w-0 space-y-4">
          {/* Navigation + search */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <nav aria-label="Community sections" className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-xl border border-line bg-white p-1">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => run({ tab: t.id, filter, query })}
                    aria-current={tab === t.id ? "page" : undefined}
                    aria-label={t.label}
                    className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:px-3.5 ${focus} ${
                      tab === t.id ? "bg-cream text-charcoal-deep" : "text-slate hover:text-charcoal-deep"
                    }`}
                  >
                    {t.id === "feed" ? (
                      <>
                        <span className="sm:hidden" aria-hidden>Feed</span>
                        <span className="hidden sm:inline" aria-hidden>{t.label}</span>
                      </>
                    ) : (
                      t.label
                    )}
                  </button>
                ))}
              </nav>
              <Notifications />
            </div>
            <div className="relative">
              <Search size={17} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate" />
              <label htmlFor="community-search" className="sr-only">Search posts or people</label>
              <input
                id="community-search"
                type="search"
                value={query}
                onChange={(e) => run({ tab, filter, query: e.target.value }, 300)}
                placeholder="Search posts or people…"
                className={`h-11 w-full rounded-xl border border-line bg-white pl-11 pr-4 text-sm placeholder:text-slate/70 ${focus}`}
              />
            </div>
            <div role="group" aria-label="Filter posts" className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" onClick={() => run({ tab, filter: f.id, query })} aria-pressed={filter === f.id} className={chip(filter === f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div ref={composerRef} className="scroll-mt-24">
            <Composer />
          </div>

          {/* Feed */}
          <div className={`space-y-4 transition-opacity ${loading && visible.length > 0 ? "opacity-60" : ""}`} aria-live="polite" aria-busy={loading}>
            {visible.length === 0 ? (
              loading ? (
                <div aria-hidden className="h-40 animate-pulse rounded-[22px] bg-white/70" />
              ) : feed.status === "error" ? (
                <EmptyState
                  title="Could not load the feed"
                  text="Please check your connection and try again."
                  action={<button type="button" className={primaryBtn} onClick={() => run({ tab, filter, query })}>Try again</button>}
                />
              ) : (
                <EmptyState
                  title={query ? "No matches" : tab === "mine" ? "You have not posted yet" : "No posts to show"}
                  text={
                    query
                      ? `Nothing matches "${query}". Try a different word or name.`
                      : tab === "mine"
                        ? "Share something positive and it will appear here."
                        : filter === "media"
                          ? "No posts with images or files yet."
                          : "Be the first to share something with the community."
                  }
                  action={
                    query ? (
                      <button type="button" className={secondaryBtn} onClick={() => run({ tab, filter, query: "" })}>Clear search</button>
                    ) : user ? (
                      <button type="button" className={primaryBtn} onClick={shareSomething}>Share Something</button>
                    ) : undefined
                  }
                />
              )
            ) : (
              visible.map((p) => <PostCard key={p.id} post={p} />)
            )}
          </div>
          {feed.status === "error" && visible.length > 0 && (
            <p role="alert" className="text-center text-sm text-red-700">Could not load more. Please try again.</p>
          )}
          {feed.hasMore && visible.length > 0 && (
            <div className="flex justify-center pt-2">
              <button type="button" onClick={() => void loadMoreFeed()} disabled={loading} className={secondaryBtn}>
                {loading ? "Loading…" : "Load more posts"}
              </button>
            </div>
          )}
        </div>
        <div className="lg:sticky lg:top-6 lg:self-start">
          <Sidebar />
        </div>
      </div>
    </main>
  );
}
