"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FileText, ImagePlus, Paperclip, X } from "lucide-react";
import {
  ACCEPT_FILES,
  ACCEPT_IMAGES,
  ALLOWED_LABEL,
  LIMITS,
  MAX_SIZE_LABEL,
  kindOf,
} from "@/lib/community/config";
import { fileTypeLabel, formatBytes, uid, validateFile } from "@/lib/community/format";
import type { DraftAttachment } from "@/lib/community/types";
import { useCommunity } from "./community-provider";
import { Avatar, CharCounter, focus, primaryBtn, secondaryBtn } from "./ui";

export function Composer() {
  const { user, composerOpen, setComposerOpen, requireAuth, publishPost, toast } = useCommunity();
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<DraftAttachment[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const draftsRef = useRef<DraftAttachment[]>([]);
  const id = useId();

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);
  // Free any preview URLs still held when the composer goes away.
  useEffect(
    () => () => draftsRef.current.forEach((d) => d.src && URL.revokeObjectURL(d.src)),
    [],
  );

  useEffect(() => {
    if (composerOpen) area.current?.focus();
  }, [composerOpen]);

  const reset = () => {
    drafts.forEach((d) => d.src && URL.revokeObjectURL(d.src));
    setText("");
    setDrafts([]);
    setErrors([]);
    setComposerOpen(false);
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const accepted: DraftAttachment[] = [];
    const errs: string[] = [];
    for (const file of Array.from(list)) {
      const err = validateFile(file, [...drafts, ...accepted]);
      if (err) {
        errs.push(err);
        continue;
      }
      const kind = kindOf(file.name)!;
      const url = URL.createObjectURL(file);
      accepted.push({
        id: uid("att"),
        kind,
        name: file.name,
        size: file.size,
        mime: file.type || "application/octet-stream",
        src: kind === "image" ? url : undefined,
        href: url,
        alt: kind === "image" ? file.name : undefined,
        file,
      });
    }
    setDrafts((d) => [...d, ...accepted]);
    setErrors(errs);
    if (errs.length) toast(errs.length === 1 ? errs[0] : `${errs.length} files were rejected`, "error");
  };

  const remove = (aid: string) => {
    const d = drafts.find((x) => x.id === aid);
    if (d?.src) URL.revokeObjectURL(d.src);
    setDrafts((all) => all.filter((x) => x.id !== aid));
    setErrors([]);
  };

  const trimmed = text.trim();
  const tooLong = text.length > LIMITS.maxPostChars;
  const canPublish = (trimmed.length > 0 || drafts.length > 0) && !tooLong && !busy;

  const open = () => {
    if (requireAuth(() => setComposerOpen(true))) setComposerOpen(true);
  };

  if (!composerOpen) {
    return (
      <div className="flex items-center gap-3 rounded-[22px] border border-line bg-white p-4">
        {user ? (
          <Avatar member={user} />
        ) : (
          <span aria-hidden className="size-11 shrink-0 rounded-full border border-line bg-mist" />
        )}
        <button
          type="button"
          onClick={open}
          className={`h-11 min-w-0 flex-1 rounded-xl border border-line bg-ivory px-4 text-left text-sm text-slate transition-colors hover:border-slate/50 ${focus}`}
        >
          <span className="block truncate">Share something positive with the community…</span>
        </button>
      </div>
    );
  }

  const images = drafts.filter((d) => d.kind === "image");
  const files = drafts.filter((d) => d.kind === "file");

  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (!canPublish) return;
        setBusy(true);
        const ok = await publishPost(trimmed, drafts);
        setBusy(false);
        if (ok) {
          // Previews now belong to the published post. Don't revoke them here.
          setText("");
          setDrafts([]);
          setErrors([]);
          setComposerOpen(false);
        }
      }}
      className="rounded-[22px] border border-line bg-white p-4 sm:p-5"
      aria-label="Create a post"
    >
      <div className="flex gap-3">
        {user && <Avatar member={user} />}
        <div className="min-w-0 flex-1">
          <label htmlFor={`${id}-text`} className="sr-only">Post message</label>
          <textarea
            id={`${id}-text`}
            ref={area}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            disabled={busy}
            placeholder="Share something positive with the community…"
            aria-invalid={tooLong || undefined}
            className={`w-full resize-y rounded-xl border bg-ivory px-4 py-3 text-base leading-relaxed placeholder:text-slate/70 disabled:opacity-60 ${focus} ${tooLong ? "border-red-600" : "border-line"}`}
          />
        </div>
      </div>

      {images.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {images.map((d) => (
            <li key={d.id} className="relative aspect-square overflow-hidden rounded-xl border border-line bg-mist">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={d.src} alt={`Preview of ${d.name}`} className="size-full object-cover" />
              <button
                type="button"
                onClick={() => remove(d.id)}
                aria-label={`Remove ${d.name}`}
                disabled={busy}
                className={`absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-charcoal-deep/80 text-white transition hover:bg-charcoal-deep ${focus}`}
              >
                <X size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {files.map((d) => (
            <li key={d.id} className="flex items-center gap-3 rounded-xl border border-line bg-ivory p-3">
              <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white">
                <FileText size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-all text-sm font-medium leading-snug">{d.name}</p>
                <p className="text-xs text-slate">{fileTypeLabel(d.name)} · {formatBytes(d.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => remove(d.id)}
                aria-label={`Remove ${d.name}`}
                disabled={busy}
                className={`flex size-8 shrink-0 items-center justify-center rounded-lg text-slate hover:bg-charcoal-deep/5 hover:text-charcoal-deep ${focus}`}
              >
                <X size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {errors.length > 0 && (
        <ul role="alert" className="mt-3 space-y-1 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <input ref={imageInput} type="file" accept={ACCEPT_IMAGES} multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <input ref={fileInput} type="file" accept={ACCEPT_FILES} multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <button
          type="button"
          onClick={() => imageInput.current?.click()}
          disabled={busy}
          className={`inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-3.5 text-sm font-medium transition-colors hover:border-slate/50 ${focus}`}
        >
          <ImagePlus size={17} aria-hidden /> Add Image
        </button>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          className={`inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-3.5 text-sm font-medium transition-colors hover:border-slate/50 ${focus}`}
        >
          <Paperclip size={17} aria-hidden /> Attach File
        </button>
        <p className="basis-full text-xs leading-relaxed text-slate sm:basis-auto">
          {ALLOWED_LABEL} · {MAX_SIZE_LABEL} · up to {LIMITS.maxFiles} files ({LIMITS.maxImages} images)
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <CharCounter value={text.length} max={LIMITS.maxPostChars} />
        <div className="flex gap-2">
          <button type="button" onClick={reset} disabled={busy} className={secondaryBtn}>
            Cancel
          </button>
          <button type="submit" disabled={!canPublish} className={primaryBtn}>
            {busy ? (
              <>
                <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-charcoal-deep/30 border-t-charcoal-deep motion-reduce:animate-none" />
                Publishing…
              </>
            ) : (
              "Publish Post"
            )}
          </button>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate">
        Demo: files stay in your browser and nothing is uploaded or saved. A real backend must re-check file type, size and permissions.
      </p>
    </form>
  );
}
