"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Search } from "lucide-react";
import { formatAge } from "@/lib/community/format";
import { SAMPLE_MEMBERS } from "@/lib/community/sample-data";
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
  const { user, notifications } = useCommunity();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Notifications"
        className={`flex size-11 items-center justify-center rounded-xl border border-line bg-white text-slate transition-colors hover:border-slate/50 hover:text-charcoal-deep ${focus}`}
      >
        <Bell size={18} aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-line bg-white p-2 shadow-lg">
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-slate">
            Notifications
          </p>
          {user ? (
            <>
              <ul>
                {notifications.map((n) => (
                  <li key={n.id}>
                    <Link
                      href={n.href ?? "/community"}
                      onClick={() => setOpen(false)}
                      className={`block rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-charcoal-deep/5 ${focus}`}
                    >
                      {n.text}
                      <span className="block text-xs text-slate">{formatAge(n.ageMinutes)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="border-t border-line px-3 py-2 text-xs text-slate">
                Sample notifications for the design preview. Real ones will appear once the backend is connected.
              </p>
            </>
          ) : (
            <p className="px-3 py-3 text-sm text-slate">Sign in to see replies and appreciation on your posts.</p>
          )}
        </div>
      )}
    </div>
  );
}

function Sidebar() {
  return (
    <aside className="space-y-4" aria-label="Community information">
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
  const { user, posts, comments, likedPosts, ageOf, requireAuth, setComposerOpen, getMember } = useCommunity();
  const [tab, setTab] = useState<Tab>("feed");
  const [filter, setFilter] = useState<Filter>("latest");
  const [query, setQuery] = useState("");
  const composerRef = useRef<HTMLDivElement>(null);

  const shareSomething = () => {
    const go = () => {
      setTab("feed");
      setComposerOpen(true);
      composerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    if (requireAuth(go)) go();
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = posts.filter((p) => {
      if (tab === "mine") return !!user && p.authorId === user.id;
      return true;
    });
    if (filter === "media") list = list.filter((p) => p.attachments.length > 0);
    if (q) {
      list = list.filter((p) => {
        const a = getMember(p.authorId);
        return (
          p.text.toLowerCase().includes(q) ||
          a?.name.toLowerCase().includes(q) ||
          a?.username.toLowerCase().includes(q) ||
          p.attachments.some((x) => x.name.toLowerCase().includes(q))
        );
      });
    }
    const score = (p: (typeof posts)[number]) =>
      p.baseLikes + (likedPosts.has(p.id) ? 1 : 0) + comments.filter((c) => c.postId === p.id).length * 2;
    return [...list].sort((a, b) => (filter === "popular" ? score(b) - score(a) : ageOf(a) - ageOf(b)));
  }, [posts, comments, tab, filter, query, user, likedPosts, ageOf, getMember]);

  const chip = (active: boolean) =>
    `rounded-full border px-4 py-2 text-sm font-medium transition-colors ${focus} ${
      active ? "border-charcoal-deep bg-charcoal-deep text-white" : "border-line bg-white text-slate hover:border-slate/50 hover:text-charcoal-deep"
    }`;

  const signedOutEmpty = !user && tab !== "feed";

  return (
    <main className="bg-ivory">
      {/* Welcome (compact) */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-8 pt-28 sm:px-6 sm:pt-32 lg:px-10">
        <div className="max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-bless-deep">The Chosen Bless Community</span>
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
            <Link href="/channels" className={secondaryBtn}>Explore Channels</Link>
          </div>
          <div className="flex items-center gap-3">
            <ul className="flex -space-x-2" aria-label="Sample community members">
              {SAMPLE_MEMBERS.filter((m) => m.id !== "u-demo").map((m) => (
                <li key={m.id} className="rounded-full ring-2 ring-ivory"><Avatar member={m} size="sm" /></li>
              ))}
            </ul>
            <span className="text-xs text-slate">Sample members</span>
          </div>
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
                    onClick={() => setTab(t.id)}
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
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search posts or people…"
                className={`h-11 w-full rounded-xl border border-line bg-white pl-11 pr-4 text-sm placeholder:text-slate/70 ${focus}`}
              />
            </div>
            <div role="group" aria-label="Filter posts" className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" onClick={() => setFilter(f.id)} aria-pressed={filter === f.id} className={chip(filter === f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div ref={composerRef} className="scroll-mt-24">
            <Composer />
          </div>

          {/* Feed */}
          <div className="space-y-4" aria-live="polite">
            {signedOutEmpty ? (
              <EmptyState
                title="Sign in to see your posts"
                text="Your own posts appear here once you're signed in."
                action={<button type="button" className={primaryBtn} onClick={() => requireAuth()}>Sign In</button>}
              />
            ) : visible.length === 0 ? (
              <EmptyState
                title={query ? "No matches" : tab === "mine" ? "You haven't posted yet" : "No posts to show"}
                text={
                  query
                    ? `Nothing matches "${query}". Try a different word or name.`
                    : tab === "mine"
                      ? "Share something positive and it will appear here."
                      : "Try a different filter."
                }
                action={
                  query ? (
                    <button type="button" className={secondaryBtn} onClick={() => setQuery("")}>Clear search</button>
                  ) : tab === "mine" ? (
                    <button type="button" className={primaryBtn} onClick={shareSomething}>Share Something</button>
                  ) : undefined
                }
              />
            ) : (
              visible.map((p) => <PostCard key={p.id} post={p} />)
            )}
          </div>
        </div>
        <div className="lg:sticky lg:top-6 lg:self-start">
          <Sidebar />
        </div>
      </div>
    </main>
  );
}
