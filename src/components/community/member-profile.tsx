"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { loadMemberPostsAction } from "@/actions/community";
import { setRoleAction, suspendUserAction, unsuspendUserAction } from "@/actions/moderation";
import type { Member } from "@/lib/community/types";
import { useCommunity } from "./community-provider";
import { PostCard } from "./post-card";
import { Attachments } from "./attachments";
import { ConfirmDialog, ReasonDialog } from "./dialogs";
import { Avatar, EmptyState, focus, secondaryBtn } from "./ui";

/**
 * Public profile. Shows only public fields (name, username, bio, join date, posts).
 * Never render email or account details here. No Follow button: following isn't part of this version.
 */
export interface AdminView {
  status: "active" | "suspended";
  role: "member" | "moderator" | "admin";
}

/** Admin-only tools shown on a member's profile: suspend / unsuspend and change role. */
function AdminTools({ member, admin }: { member: Member; admin: AdminView }) {
  const router = useRouter();
  const { toast } = useCommunity();
  const [dialog, setDialog] = useState<null | "suspend" | "unsuspend" | "role">(null);
  const [role, setRole] = useState<"member" | "moderator">(admin.role === "moderator" ? "moderator" : "member");
  const suspended = admin.status === "suspended";

  async function run(r: { ok: boolean; error?: { message: string } }, success: string) {
    if (!r.ok) {
      toast(r.error?.message ?? "Something went wrong.", "error");
      return false;
    }
    toast(success);
    router.refresh();
    return true;
  }

  return (
    <section aria-label="Admin tools" className="mt-4 rounded-[22px] border border-dashed border-charcoal-deep/30 bg-white p-4 sm:p-5">
      <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-charcoal-deep">Admin tools</h2>
      <p className="mt-2 text-sm text-slate">
        Status: <span className={`font-semibold ${suspended ? "text-red-700" : "text-charcoal-deep"}`}>{suspended ? "Suspended" : "Active"}</span>
        {" · "}Role: <span className="font-semibold text-charcoal-deep">{admin.role}</span>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {suspended ? (
          <button type="button" onClick={() => setDialog("unsuspend")} className={`${secondaryBtn} h-10`}>Unsuspend</button>
        ) : (
          <button
            type="button"
            onClick={() => setDialog("suspend")}
            className={`inline-flex h-10 items-center justify-center rounded-xl bg-red-700 px-4 text-sm font-semibold text-white transition hover:bg-red-800 ${focus}`}
          >
            Suspend member
          </button>
        )}
        <label className="flex items-center gap-2 text-sm text-slate">
          Role
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "member" | "moderator")}
            className={`h-10 rounded-xl border border-line bg-white px-3 text-sm text-charcoal-deep ${focus}`}
          >
            <option value="member">Member</option>
            <option value="moderator">Moderator</option>
          </select>
        </label>
        <button type="button" disabled={role === admin.role} onClick={() => setDialog("role")} className={`${secondaryBtn} h-10`}>Change role</button>
      </div>

      <ReasonDialog
        open={dialog === "suspend"}
        title={`Suspend ${member.name}?`}
        text="They won't be able to sign in or take part until you unsuspend them. Their existing posts stay up unless you remove them. The action is logged."
        confirmLabel="Suspend"
        placeholder="Reason (kept in the audit log)"
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => run(await suspendUserAction(member.id, { reason }), `${member.name} was suspended.`)}
      />
      <ConfirmDialog
        open={dialog === "unsuspend"}
        title={`Unsuspend ${member.name}?`}
        text="They can sign in and take part again."
        confirmLabel="Unsuspend"
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          await run(await unsuspendUserAction(member.id), `${member.name} was unsuspended.`);
          setDialog(null);
        }}
      />
      <ConfirmDialog
        open={dialog === "role"}
        title={`Make ${member.name} a ${role}?`}
        text={role === "moderator" ? "Moderators can remove posts and comments and work the report queue." : "They will lose moderator tools."}
        confirmLabel="Change role"
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          await run(await setRoleAction(member.id, { role }), `${member.name} is now a ${role}.`);
          setDialog(null);
        }}
      />
    </section>
  );
}

export function MemberProfile({ member, initialCursor, admin }: { member: Member; initialCursor: string | null; admin?: AdminView }) {
  const { posts, ingest, toast } = useCommunity();
  const [tab, setTab] = useState<"posts" | "media">("posts");
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);

  const mine = posts.filter((p) => p.authorId === member.id);
  const media = mine.filter((p) => p.attachments.length > 0);
  const list = tab === "posts" ? mine : media;

  const loadMore = async () => {
    if (!cursor || loading) return;
    setLoading(true);
    const r = await loadMemberPostsAction(member.username, { cursor });
    setLoading(false);
    if (!r.ok) return toast("Could not load more posts. Please try again.", "error");
    ingest(r.data);
    setCursor(r.data.nextCursor);
  };

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
            {member.bio && <p className="mt-3 max-w-prose text-base leading-relaxed text-charcoal-deep/85">{member.bio}</p>}
            <p className="mt-3 inline-flex items-center gap-2 text-sm text-slate">
              <CalendarDays size={15} aria-hidden /> Joined {member.joined}
            </p>
          </div>
        </section>

        {admin && <AdminTools member={member} admin={admin} />}

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
              {t === "posts" ? `Posts (${mine.length}${cursor ? "+" : ""})` : `Images & files (${media.length}${cursor ? "+" : ""})`}
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
                  {p.text || "View post"}
                </Link>
                <Attachments attachments={p.attachments} />
              </div>
            ))
          )}
        </div>

        {cursor && (
          <div className="mt-6 flex justify-center">
            <button type="button" onClick={loadMore} disabled={loading} className={secondaryBtn}>
              {loading ? "Loading…" : "Load more posts"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
