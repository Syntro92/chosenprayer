"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { Heart, Pencil, Reply, Send, Trash2 } from "lucide-react";
import { LIMITS } from "@/lib/community/config";
import { formatAge } from "@/lib/community/format";
import type { Comment } from "@/lib/community/types";
import { useCommunity } from "./community-provider";
import { ConfirmDialog } from "./dialogs";
import { ActionMenu, Avatar, CharCounter, EmptyState, focus, type MenuItem } from "./ui";

function CommentForm({
  postId,
  parentId,
  initial = "",
  placeholder = "Write a thoughtful comment…",
  submitLabel = "Send",
  autoFocus,
  onDone,
  onCancel,
  editId,
}: {
  postId: string;
  parentId?: string;
  initial?: string;
  placeholder?: string;
  submitLabel?: string;
  autoFocus?: boolean;
  onDone?: () => void;
  onCancel?: () => void;
  editId?: string;
}) {
  const { user, requireAuth, addComment, editComment } = useCommunity();
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const id = useId();

  if (!user) {
    return (
      <button
        type="button"
        onClick={() => requireAuth(() => setTimeout(() => input.current?.focus(), 50))}
        className={`h-11 w-full rounded-xl border border-line bg-ivory px-4 text-left text-sm text-slate hover:border-slate/50 ${focus}`}
      >
        Sign in to write a comment…
      </button>
    );
  }

  const submit = async () => {
    const value = text.trim();
    if (busy) return; // prevents duplicate submissions
    if (!value) return setError("Please write something before sending.");
    if (value.length > LIMITS.maxCommentChars) return setError(`Comments can be up to ${LIMITS.maxCommentChars} characters.`);
    setError("");
    setBusy(true);
    const ok = editId ? await editComment(editId, value) : await addComment(postId, value, parentId);
    setBusy(false);
    if (ok) {
      setText("");
      onDone?.();
    } else {
      setError("Something went wrong. Your text is still here, so you can try again.");
    }
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="flex items-start gap-2.5">
        <Avatar member={user} size="sm" />
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className="sr-only">{placeholder}</label>
          <input
            id={id}
            ref={input}
            type="text"
            value={text}
            autoFocus={autoFocus}
            disabled={busy}
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError("");
            }}
            placeholder={placeholder}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-err` : undefined}
            className={`h-10 w-full rounded-xl border bg-ivory px-3.5 text-sm placeholder:text-slate/70 disabled:opacity-60 ${focus} ${error ? "border-red-600" : "border-line"}`}
          />
        </div>
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-bless px-3.5 text-sm font-semibold text-charcoal-deep transition hover:bg-bless-deep disabled:cursor-not-allowed disabled:opacity-50 ${focus}`}
        >
          {busy ? (
            <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-charcoal-deep/30 border-t-charcoal-deep motion-reduce:animate-none" />
          ) : (
            <Send size={15} aria-hidden />
          )}
          <span className="max-sm:sr-only">{busy ? "Sending…" : submitLabel}</span>
        </button>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3 pl-[2.625rem]">
        <p id={`${id}-err`} role="alert" className="text-xs text-red-700">{error}</p>
        <div className="flex items-center gap-3">
          {onCancel && (
            <button type="button" onClick={onCancel} className={`rounded text-xs font-medium text-slate hover:text-charcoal-deep ${focus}`}>
              Cancel
            </button>
          )}
          {text.length > LIMITS.maxCommentChars * 0.7 && <CharCounter value={text.length} max={LIMITS.maxCommentChars} />}
        </div>
      </div>
    </form>
  );
}

function CommentItem({ c, replies, isReply }: { c: Comment; replies: Comment[]; isReply?: boolean }) {
  const { getMember, user, isModerator, ageOf, likedComments, toggleCommentLike, removeComment } = useCommunity();
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const author = getMember(c.authorId);
  if (!author) return null;

  const mine = user?.id === c.authorId;
  const liked = likedComments.has(c.id);
  const items: MenuItem[] = [];
  if (mine) {
    items.push({ label: "Edit comment", icon: <Pencil size={15} />, onSelect: () => setEditing(true) });
    items.push({ label: "Delete comment", icon: <Trash2 size={15} />, onSelect: () => setConfirm(true), danger: true });
  } else if (isModerator) {
    items.push({ label: "Remove comment", icon: <Trash2 size={15} />, onSelect: () => setConfirm(true), danger: true });
  }

  return (
    <li className="min-w-0">
      <div className="flex gap-2.5">
        <Avatar member={author} size="sm" />
        <div className="min-w-0 flex-1">
          {editing ? (
            <CommentForm
              postId={c.postId}
              editId={c.id}
              initial={c.text}
              submitLabel="Save"
              autoFocus
              onDone={() => setEditing(false)}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <div className="rounded-2xl bg-ivory px-3.5 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-sm leading-snug">
                  <Link href={`/community/members/${author.username}`} className={`rounded font-semibold hover:underline ${focus}`}>
                    {author.name}
                  </Link>{" "}
                  <span className="text-slate">@{author.username}</span>
                </p>
                {items.length > 0 && <ActionMenu label={`Comment options for ${author.name}`} items={items} />}
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-charcoal-deep/90">{c.text}</p>
            </div>
          )}
          {!editing && (
            <div className="mt-1 flex flex-wrap items-center gap-x-1 pl-1 text-xs text-slate">
              <span>{formatAge(ageOf(c))}{c.edited ? " · edited" : ""}</span>
              <button
                type="button"
                onClick={() => toggleCommentLike(c.id)}
                aria-pressed={liked}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1.5 font-medium transition-colors hover:text-charcoal-deep ${liked ? "text-charcoal-deep" : ""} ${focus}`}
              >
                <Heart size={13} aria-hidden className={liked ? "fill-bless text-bless-deep" : ""} />
                {c.baseLikes + (liked ? 1 : 0) || ""}
                <span className="sr-only">Appreciate comment</span>
              </button>
              {!isReply && (
                <button
                  type="button"
                  onClick={() => setReplying((r) => !r)}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1.5 font-medium transition-colors hover:text-charcoal-deep ${focus}`}
                >
                  <Reply size={13} aria-hidden /> Reply
                </button>
              )}
            </div>
          )}

          {(replies.length > 0 || replying) && (
            <ul className="mt-2 space-y-3 border-l-2 border-line pl-3">
              {replies.map((r) => (
                <CommentItem key={r.id} c={r} replies={[]} isReply />
              ))}
              {replying && (
                <li>
                  <CommentForm
                    postId={c.postId}
                    parentId={c.id}
                    placeholder={`Reply to ${author.name}…`}
                    submitLabel="Reply"
                    autoFocus
                    onDone={() => setReplying(false)}
                    onCancel={() => setReplying(false)}
                  />
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirm}
        title={mine ? "Delete this comment?" : "Remove this comment?"}
        text={
          replies.length
            ? "This will also remove its replies. This can't be undone."
            : "This can't be undone."
        }
        confirmLabel={mine ? "Delete" : "Remove"}
        busy={busy}
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          setBusy(true);
          await removeComment(c.id, !mine);
          setBusy(false);
          setConfirm(false);
        }}
      />
    </li>
  );
}

export function Comments({ postId, autoFocus }: { postId: string; autoFocus?: boolean }) {
  const { comments } = useCommunity();
  const [showAll, setShowAll] = useState(false);
  const forPost = comments.filter((c) => c.postId === postId);
  const top = forPost.filter((c) => !c.parentId);
  const hidden = showAll ? 0 : Math.max(0, top.length - LIMITS.commentsPreview);
  const visible = showAll ? top : top.slice(top.length - Math.min(top.length, LIMITS.commentsPreview));

  return (
    <div className="mt-4 border-t border-line pt-4">
      {top.length === 0 ? (
        <div className="mb-4">
          <EmptyState title="No comments yet" text="Be the first to leave a thoughtful comment." />
        </div>
      ) : (
        <>
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className={`mb-3 rounded text-sm font-medium text-slate underline-offset-4 hover:text-charcoal-deep hover:underline ${focus}`}
            >
              View {hidden} more comment{hidden === 1 ? "" : "s"}
            </button>
          )}
          <ul className="mb-4 space-y-4">
            {visible.map((c) => (
              <CommentItem key={c.id} c={c} replies={forPost.filter((r) => r.parentId === c.id)} />
            ))}
          </ul>
        </>
      )}
      <CommentForm postId={postId} autoFocus={autoFocus} />
    </div>
  );
}
