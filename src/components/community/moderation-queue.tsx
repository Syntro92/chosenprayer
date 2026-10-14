"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ExternalLink, ShieldCheck } from "lucide-react";
import { dismissReportAction, loadReportsAction, removeCommentAsModeratorAction, removePostAsModeratorAction } from "@/actions/moderation";
import { formatAge } from "@/lib/community/format";
import type { ReportItem } from "@/server/services/moderation";
import { ConfirmDialog, ReasonDialog } from "./dialogs";
import { EmptyState, focus, secondaryBtn } from "./ui";

type Page = { items: ReportItem[]; nextCursor: string | null };
type Tab = "open" | "handled";

const REASON_LABEL: Record<ReportItem["reason"], string> = {
  spam: "Spam",
  harassment: "Harassment",
  inappropriate: "Inappropriate",
  other: "Other",
};
const STATUS_LABEL = { open: "Open", dismissed: "Dismissed", actioned: "Content removed" } as const;

/** Moderator queue: work through open reports, remove content (with a reason) or dismiss. */
export function ModerationQueue({ initial }: { initial: Page }) {
  const [tab, setTab] = useState<Tab>("open");
  const [items, setItems] = useState<ReportItem[]>(initial.items);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState<ReportItem | null>(null);
  const [dismissing, setDismissing] = useState<ReportItem | null>(null);
  const [notice, setNotice] = useState("");

  async function load(next: Tab, after?: string) {
    setLoading(true);
    setError("");
    const r = await loadReportsAction({ status: next, cursor: after });
    setLoading(false);
    if (!r.ok) return setError(r.error.message);
    setItems((cur) => (after ? [...cur, ...r.data.items] : r.data.items));
    setCursor(r.data.nextCursor);
  }

  function switchTab(next: Tab) {
    if (next === tab) return;
    setTab(next);
    setNotice("");
    setItems([]);
    setCursor(null);
    void load(next);
  }

  /** Every open report about the same content is resolved together, so drop them all from the open list. */
  const dropTarget = (targetId: string) => setItems((cur) => cur.filter((i) => i.target.id !== targetId));

  async function remove(item: ReportItem, reason: string) {
    const run = item.target.kind === "post" ? removePostAsModeratorAction : removeCommentAsModeratorAction;
    const r = await run(item.target.id, { reason });
    if (!r.ok) {
      setError(r.error.message);
      return false;
    }
    dropTarget(item.target.id);
    setNotice(`${item.target.kind === "post" ? "Post" : "Comment"} removed. ${item.target.author.name} was told why.`);
    return true;
  }

  async function dismiss(item: ReportItem) {
    const r = await dismissReportAction(item.id, {});
    if (!r.ok) {
      setError(r.error.message);
      return;
    }
    dropTarget(item.target.id);
    setNotice("Report dismissed. The content stays up.");
  }

  const chip = (active: boolean) =>
    `rounded-full border px-4 py-2 text-sm font-medium transition-colors ${focus} ${
      active ? "border-charcoal-deep bg-charcoal-deep text-white" : "border-line bg-white text-slate hover:text-charcoal-deep"
    }`;

  return (
    <main className="bg-ivory">
      <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-28 sm:px-6 sm:pt-32">
        <Link href="/community" className={`inline-flex items-center gap-2 rounded text-sm font-medium text-slate hover:text-charcoal-deep ${focus}`}>
          <ArrowLeft size={16} aria-hidden /> Back to community
        </Link>
        <header className="mt-4">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-bless-deep">
            <ShieldCheck size={14} aria-hidden /> Moderation
          </span>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-charcoal-deep sm:text-4xl">Report queue</h1>
          <p className="mt-2 text-slate">Oldest reports first. One decision covers every report on the same content.</p>
        </header>

        <div role="group" aria-label="Report status" className="mt-6 flex gap-2">
          <button type="button" className={chip(tab === "open")} aria-pressed={tab === "open"} onClick={() => switchTab("open")}>Open</button>
          <button type="button" className={chip(tab === "handled")} aria-pressed={tab === "handled"} onClick={() => switchTab("handled")}>Handled</button>
        </div>

        {notice && <p role="status" className="mt-4 rounded-xl bg-cream px-4 py-3 text-sm text-charcoal-deep">{notice}</p>}
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

        <ul className="mt-6 space-y-4" aria-busy={loading}>
          {items.map((r) => (
            <li key={r.id} className="rounded-[22px] border border-line bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-cream px-3 py-1 font-semibold text-charcoal-deep">{REASON_LABEL[r.reason]}</span>
                <span className="text-slate">
                  {r.target.kind === "post" ? "Post" : "Comment"} · reported {formatAge(r.ageMinutes)} by {r.reporter.name} (@{r.reporter.username})
                </span>
                {r.status === "open" && r.openReports > 1 && (
                  <span className="rounded-full bg-red-50 px-3 py-1 font-semibold text-red-800">{r.openReports} open reports</span>
                )}
              </div>

              {r.note && <p className="mt-3 text-sm italic text-slate">&ldquo;{r.note}&rdquo;</p>}

              <div className="mt-3 rounded-2xl bg-ivory p-3.5">
                <p className="text-sm text-slate">
                  <span className="font-semibold text-charcoal-deep">{r.target.author.name}</span> @{r.target.author.username}
                  {r.target.author.role !== "member" && ` · ${r.target.author.role}`}
                  {r.target.attachments > 0 && ` · ${r.target.attachments} attachment${r.target.attachments === 1 ? "" : "s"}`}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-charcoal-deep">{r.target.text || "(no text)"}</p>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                {!r.target.removed && (
                  <Link
                    href={`/community/posts/${r.target.postId}`}
                    className={`inline-flex items-center gap-1.5 rounded text-sm font-medium text-slate underline-offset-4 hover:text-charcoal-deep hover:underline ${focus}`}
                  >
                    View in context <ExternalLink size={14} aria-hidden />
                  </Link>
                )}
                {r.status === "open" ? (
                  <div className="ml-auto flex gap-2">
                    <button type="button" onClick={() => setDismissing(r)} className={`${secondaryBtn} h-10`}>Dismiss</button>
                    <button
                      type="button"
                      onClick={() => setRemoving(r)}
                      className={`inline-flex h-10 items-center justify-center rounded-xl bg-red-700 px-4 text-sm font-semibold text-white transition hover:bg-red-800 ${focus}`}
                    >
                      Remove {r.target.kind}
                    </button>
                  </div>
                ) : (
                  <p className="ml-auto text-sm text-slate">
                    <span className="font-semibold text-charcoal-deep">{STATUS_LABEL[r.status]}</span>
                    {r.handledBy && ` by ${r.handledBy}`}
                    {r.resolution && ` · ${r.resolution}`}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>

        {!loading && items.length === 0 && !error && (
          <div className="mt-6">
            <EmptyState
              title={tab === "open" ? "All clear" : "Nothing handled yet"}
              text={tab === "open" ? "There are no open reports right now. Thank you for keeping the community kind." : "Handled reports will appear here."}
            />
          </div>
        )}

        {cursor && (
          <div className="mt-6 flex justify-center">
            <button type="button" onClick={() => void load(tab, cursor)} disabled={loading} className={secondaryBtn}>
              {loading ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>

      <ReasonDialog
        open={!!removing}
        title={`Remove this ${removing?.target.kind ?? "content"}?`}
        text="It disappears for everyone and every open report on it is closed. The author is told the reason you give, and the action is logged."
        confirmLabel="Remove"
        onClose={() => setRemoving(null)}
        onSubmit={(reason) => (removing ? remove(removing, reason) : Promise.resolve(false))}
      />
      <ConfirmDialog
        open={!!dismissing}
        title="Dismiss this report?"
        text="The content stays up and every open report on it is closed as dismissed."
        confirmLabel="Dismiss"
        onClose={() => setDismissing(null)}
        onConfirm={async () => {
          if (dismissing) await dismiss(dismissing);
          setDismissing(null);
        }}
      />
    </main>
  );
}
