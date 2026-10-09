"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ClipboardCheck,
  Flag,
  Heart,
  MessageCircle,
  Pencil,
  Share2,
  ShieldX,
  Trash2,
} from "lucide-react";
import { LIMITS } from "@/lib/community/config";
import { formatAge } from "@/lib/community/format";
import type { Post } from "@/lib/community/types";
import { Attachments } from "./attachments";
import { Comments } from "./comments";
import { useCommunity } from "./community-provider";
import { ConfirmDialog, InfoDialog, ReportDialog } from "./dialogs";
import { ActionMenu, Avatar, CharCounter, focus, primaryBtn, secondaryBtn, type MenuItem } from "./ui";

export function PostCard({ post, detail = false }: { post: Post; detail?: boolean }) {
  const {
    getMember,
    user,
    isModerator,
    ageOf,
    comments,
    likedPosts,
    toggleLike,
    requireAuth,
    editPost,
    removePost,
    reportPost,
    toast,
  } = useCommunity();

  const [expanded, setExpanded] = useState(detail);
  const [commentsOpen, setCommentsOpen] = useState(detail);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.text);
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<null | "delete" | "remove" | "report" | "review">(null);
  const [busy, setBusy] = useState(false);

  const author = getMember(post.authorId);
  if (!author) return null;

  const mine = user?.id === post.authorId;
  const liked = likedPosts.has(post.id);
  const commentCount = comments.filter((c) => c.postId === post.id).length;
  const long = post.text.length > LIMITS.collapsePostAt;
  const postUrl = `/community/posts/${post.id}`;

  const share = async () => {
    const url = `${window.location.origin}${postUrl}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied to clipboard", "info");
    } catch {
      toast(`Copy this link: ${url}`, "info");
    }
  };

  // Anyone can read comments; writing one asks visitors to sign in (see CommentForm).
  const openComments = () => setCommentsOpen((o) => !o);

  const items: MenuItem[] = [];
  if (mine) {
    items.push({ label: "Edit post", icon: <Pencil size={15} />, onSelect: () => { setDraft(post.text); setEditing(true); } });
  }
  if (!mine) {
    items.push({
      label: "Report post",
      icon: <Flag size={15} />,
      onSelect: () => {
        if (requireAuth(() => setDialog("report"))) setDialog("report");
      },
    });
  }
  if (mine) {
    items.push({ label: "Delete post", icon: <Trash2 size={15} />, onSelect: () => setDialog("delete"), danger: true });
  }
  if (isModerator && !mine) {
    items.push({ label: "Review report", icon: <ClipboardCheck size={15} />, onSelect: () => setDialog("review") });
    items.push({ label: "Hide / remove post", icon: <ShieldX size={15} />, onSelect: () => setDialog("remove"), danger: true });
  }

  const action = `inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium text-slate transition-colors hover:bg-charcoal-deep/5 hover:text-charcoal-deep ${focus}`;

  return (
    <article className="rounded-[22px] border border-line bg-white p-4 sm:p-5" aria-label={`Post by ${author.name}`}>
      <header className="flex items-start gap-3">
        <Link href={`/community/members/${author.username}`} aria-label={`${author.name}'s profile`} className={`rounded-full ${focus}`}>
          <Avatar member={author} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold leading-tight">
            <Link href={`/community/members/${author.username}`} className={`rounded hover:underline ${focus}`}>
              {author.name}
            </Link>
          </p>
          <p className="truncate text-sm text-slate">
            @{author.username} ·{" "}
            <Link href={postUrl} className={`rounded hover:underline ${focus}`}>
              {formatAge(ageOf(post))}
            </Link>
            {post.edited ? " · edited" : ""}
          </p>
        </div>
        <ActionMenu label={`Post options for ${author.name}`} items={items} />
      </header>

      {editing ? (
        <form
          noValidate
          className="mt-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const v = draft.trim();
            if (!v || v.length > LIMITS.maxPostChars || saving) return;
            setSaving(true);
            const ok = await editPost(post.id, v);
            setSaving(false);
            if (ok) setEditing(false);
          }}
        >
          <label htmlFor={`edit-${post.id}`} className="sr-only">Edit post</label>
          <textarea
            id={`edit-${post.id}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            autoFocus
            disabled={saving}
            className={`w-full resize-y rounded-xl border border-line bg-ivory px-4 py-3 text-base leading-relaxed ${focus}`}
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <CharCounter value={draft.length} max={LIMITS.maxPostChars} />
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditing(false)} className={`${secondaryBtn} h-10`} disabled={saving}>Cancel</button>
              <button type="submit" className={`${primaryBtn} h-10`} disabled={saving || !draft.trim() || draft.length > LIMITS.maxPostChars}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <div className="mt-3">
          <p className={`whitespace-pre-wrap break-words text-base leading-relaxed text-charcoal-deep ${long && !expanded ? "line-clamp-4" : ""}`}>
            {post.text}
          </p>
          {long && !detail && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              aria-expanded={expanded}
              className={`mt-1 rounded text-sm font-medium text-slate underline-offset-4 hover:text-charcoal-deep hover:underline ${focus}`}
            >
              {expanded ? "Show less" : "Read more"}
            </button>
          )}
        </div>
      )}

      <Attachments attachments={post.attachments} />

      <div className="mt-4 flex items-center gap-1 border-t border-line pt-2">
        <button type="button" onClick={() => toggleLike(post.id)} aria-pressed={liked} className={action}>
          <Heart size={18} aria-hidden className={liked ? "fill-bless text-bless-deep" : ""} />
          <span className="tabular-nums">{post.baseLikes + (liked ? 1 : 0)}</span>
          <span className="sr-only">Appreciate post</span>
        </button>
        {detail ? (
          <span className={`${action} cursor-default hover:bg-transparent`}>
            <MessageCircle size={18} aria-hidden />
            <span className="tabular-nums">{commentCount}</span>
            <span className="sr-only">comments</span>
          </span>
        ) : (
          <button type="button" onClick={openComments} aria-expanded={commentsOpen} className={action}>
            <MessageCircle size={18} aria-hidden />
            <span className="tabular-nums">{commentCount}</span>
            <span className="sr-only">Comments</span>
          </button>
        )}
        <button type="button" onClick={share} className={action} aria-label="Share post (copy link)">
          <Share2 size={18} aria-hidden />
          <span className="max-sm:sr-only">Share</span>
        </button>
      </div>

      {commentsOpen && <Comments postId={post.id} autoFocus={!detail} />}

      <ConfirmDialog
        open={dialog === "delete" || dialog === "remove"}
        title={dialog === "remove" ? "Hide / remove this post?" : "Delete this post?"}
        text={
          dialog === "remove"
            ? "This removes the post and its comments from the community. A real moderation system would also record why."
            : "This removes your post and its comments. This can't be undone."
        }
        confirmLabel={dialog === "remove" ? "Remove post" : "Delete post"}
        busy={busy}
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          setBusy(true);
          await removePost(post.id, dialog === "remove");
          setBusy(false);
          setDialog(null);
        }}
      />
      <ReportDialog
        open={dialog === "report"}
        onClose={() => setDialog(null)}
        onSubmit={(reason, note) => reportPost(post.id, reason, note)}
      />
      <InfoDialog
        open={dialog === "review"}
        title="Review report"
        text="Report review isn't built yet. This is the integration point where a moderation queue will open. Demo mode: there are no real reports."
        onClose={() => setDialog(null)}
      />
    </article>
  );
}
