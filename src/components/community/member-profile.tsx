"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { useCommunity } from "./community-provider";
import { PostCard } from "./post-card";
import { Attachments } from "./attachments";
import { Avatar, EmptyState, focus, primaryBtn } from "./ui";

/**
 * Public profile. Shows only public fields (name, username, bio, join date, posts).
 * Never render email or account details here. No Follow button: following isn't part of this version.
 */
export function MemberProfile({ username }: { username: string }) {
  const { getMemberByUsername, posts } = useCommunity();
  const [tab, setTab] = useState<"posts" | "media">("posts");
  const member = getMemberByUsername(username);

  if (!member) {
    return (
      <main className="bg-ivory">
        <div className="mx-auto w-full max-w-[720px] px-4 pb-24 pt-32 sm:px-6">
          <EmptyState
            title="Member not found"
            text="We couldn't find a member with that username."
            action={<Link href="/community" className={primaryBtn}>Back to community</Link>}
          />
        </div>
      </main>
    );
  }

  const mine = posts.filter((p) => p.authorId === member.id);
  const media = mine.filter((p) => p.attachments.length > 0);
  const list = tab === "posts" ? mine : media;

  return (
    <main className="bg-ivory">
      <div className="mx-auto w-full max-w-[720px] px-4 pb-24 pt-24 sm:px-6 sm:pt-28">
        <Link href="/community" className={`inline-flex items-center gap-2 rounded text-sm font-medium text-slate hover:text-charcoal-deep ${focus}`}>
          <ArrowLeft size={16} aria-hidden /> Back to community
        </Link>

        <section className="mt-4 overflow-hidden rounded-[22px] border border-line bg-white">
          <div aria-hidden className="h-28 bg-cream sm:h-36">
            <svg viewBox="0 0 400 120" preserveAspectRatio="xMidYMid slice" className="size-full text-bless/50" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="320" cy="34" r="20" />
              <path d="M0 96c60-26 110-26 170 0s120 26 230-8" />
              <path d="M0 112c70-20 130-20 190 0s130 16 210-4" />
            </svg>
          </div>
          <div className="px-5 pb-6 sm:px-7">
            <div className="-mt-10 w-fit rounded-full bg-white p-1.5">
              <Avatar member={member} size="xl" />
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{member.name}</h1>
            <p className="text-sm text-slate">@{member.username}</p>
            <p className="mt-3 max-w-prose text-base leading-relaxed text-charcoal-deep/85">{member.bio}</p>
            <p className="mt-3 inline-flex items-center gap-2 text-sm text-slate">
              <CalendarDays size={15} aria-hidden /> Joined {member.joined}
            </p>
          </div>
        </section>

        <div role="group" aria-label="Profile sections" className="mt-6 flex gap-2">
          {(["posts", "media"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${focus} ${
                tab === t ? "border-charcoal-deep bg-charcoal-deep text-white" : "border-line bg-white text-slate hover:text-charcoal-deep"
              }`}
            >
              {t === "posts" ? `Posts (${mine.length})` : `Images & files (${media.length})`}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-4">
          {list.length === 0 ? (
            <EmptyState title="Nothing here yet" text={`${member.name} hasn't shared anything ${tab === "media" ? "with images or files " : ""}yet.`} />
          ) : tab === "posts" ? (
            list.map((p) => <PostCard key={p.id} post={p} />)
          ) : (
            list.map((p) => (
              <div key={p.id} className="rounded-[22px] border border-line bg-white p-4 sm:p-5">
                <Link href={`/community/posts/${p.id}`} className={`line-clamp-2 rounded text-sm font-medium hover:underline ${focus}`}>
                  {p.text}
                </Link>
                <Attachments attachments={p.attachments} />
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
