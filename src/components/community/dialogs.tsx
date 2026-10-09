"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";
import type { ReportReason } from "@/lib/community/types";
import { Modal, focus, primaryBtn, secondaryBtn } from "./ui";

/**
 * Shown when a visitor tries to post, comment or like.
 * INTEGRATION POINT: replace the Sign In link target and the demo button with the
 * real auth flow, passing `next` so the user returns to the same place.
 */
export function SignInPrompt({
  open,
  onClose,
  onDemoMember,
}: {
  open: boolean;
  onClose: () => void;
  onDemoMember: () => void;
}) {
  const id = useId();
  const pathname = usePathname();
  return (
    <Modal open={open} onClose={onClose} labelledBy={id}>
      <h2 id={id} className="text-2xl font-semibold tracking-tight">
        Sign in to join in
      </h2>
      <p className="mt-3 text-base leading-relaxed text-slate">
        You can browse the community freely. To post, comment or appreciate, please sign in.
        We&apos;ll bring you back to where you were.
      </p>
      <div className="mt-6 flex flex-col gap-3">
        <Link href={`/signin?next=${encodeURIComponent(pathname)}`} className={primaryBtn}>
          Sign In
        </Link>
        <button type="button" onClick={onDemoMember} className={secondaryBtn}>
          Preview as a member (demo)
        </button>
        <button type="button" onClick={onClose} className={`rounded-lg py-2 text-sm font-medium text-slate hover:text-charcoal-deep ${focus}`}>
          Keep browsing
        </button>
      </div>
      <p className="mt-4 border-t border-line pt-4 text-xs leading-relaxed text-slate">
        Demo mode: there is no real sign-in connected yet, so the preview button doesn&apos;t create an
        account or save anything.
      </p>
    </Modal>
  );
}

export function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  text: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const id = useId();
  return (
    <Modal open={open} onClose={onClose} labelledBy={id}>
      <h2 id={id} className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-3 text-base leading-relaxed text-slate">{text}</p>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} className={secondaryBtn} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={`inline-flex h-11 items-center justify-center rounded-xl bg-red-700 px-5 text-sm font-semibold text-white transition hover:bg-red-800 disabled:opacity-60 ${focus}`}
        >
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "other", label: "Other" },
];

export function ReportDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: ReportReason, note: string) => Promise<boolean>;
}) {
  const id = useId();
  const [reason, setReason] = useState<ReportReason | "">("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => {
    setReason("");
    setNote("");
    setError("");
    onClose();
  };

  return (
    <Modal open={open} onClose={close} labelledBy={id}>
      <h2 id={id} className="text-xl font-semibold tracking-tight">Report this post</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate">
        Tell us what&apos;s wrong. Reports are reviewed by moderators.
      </p>
      <form
        noValidate
        className="mt-5 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!reason) return setError("Please choose a reason.");
          setBusy(true);
          const ok = await onSubmit(reason, note.trim());
          setBusy(false);
          if (ok) close();
        }}
      >
        <fieldset>
          <legend className="sr-only">Reason</legend>
          <div className="space-y-2">
            {REASONS.map((r) => (
              <label
                key={r.value}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors ${
                  reason === r.value ? "border-bless bg-cream" : "border-line hover:border-slate/50"
                }`}
              >
                <input
                  type="radio"
                  name={`${id}-reason`}
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => {
                    setReason(r.value);
                    setError("");
                  }}
                  className="accent-[#171918]"
                />
                {r.label}
              </label>
            ))}
          </div>
          {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
        </fieldset>
        <div>
          <label htmlFor={`${id}-note`} className="text-sm font-medium">
            Anything else? <span className="font-normal text-slate">(optional)</span>
          </label>
          <textarea
            id={`${id}-note`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            rows={3}
            className={`mt-1.5 w-full resize-none rounded-xl border border-line bg-ivory px-4 py-3 text-sm ${focus}`}
          />
        </div>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={close} className={secondaryBtn} disabled={busy}>Cancel</button>
          <button type="submit" className={primaryBtn} disabled={busy}>
            {busy ? "Sending…" : "Submit report"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function InfoDialog({
  open,
  title,
  text,
  onClose,
}: {
  open: boolean;
  title: string;
  text: string;
  onClose: () => void;
}) {
  const id = useId();
  return (
    <Modal open={open} onClose={onClose} labelledBy={id}>
      <h2 id={id} className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-3 text-base leading-relaxed text-slate">{text}</p>
      <div className="mt-6 flex justify-end">
        <button type="button" onClick={onClose} className={primaryBtn}>Got it</button>
      </div>
    </Modal>
  );
}
