"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";
import type { ReportReason } from "@/lib/community/types";
import { Modal, focus, primaryBtn, secondaryBtn } from "./ui";

/** Shown when someone who isn't signed in tries to post, comment or appreciate. */
export function SignInPrompt({ open, onClose }: { open: boolean; onClose: () => void }) {
  const id = useId();
  const pathname = usePathname();
  const next = encodeURIComponent(pathname);
  return (
    <Modal open={open} onClose={onClose} labelledBy={id}>
      <h2 id={id} className="text-2xl font-semibold tracking-tight">
        Sign in to join in
      </h2>
      <p className="mt-3 text-base leading-relaxed text-slate">
        To post, comment or appreciate, please sign in. We&apos;ll bring you back to where you were.
      </p>
      <div className="mt-6 flex flex-col gap-3">
        <Link href={`/signin?next=${next}`} className={primaryBtn}>
          Sign In
        </Link>
        <Link href={`/signup?next=${next}`} className={secondaryBtn}>
          Create an account
        </Link>
        <button type="button" onClick={onClose} className={`rounded-lg py-2 text-sm font-medium text-slate hover:text-charcoal-deep ${focus}`}>
          Keep browsing
        </button>
      </div>
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
  subject = "post",
}: {
  subject?: "post" | "comment";
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
      <h2 id={id} className="text-xl font-semibold tracking-tight">Report this {subject}</h2>
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

/**
 * Asks for a written reason before a moderation action (remove, suspend...).
 * `onSubmit` resolves true to close the dialog; on false the dialog stays open with the text intact.
 */
export function ReasonDialog({
  open,
  title,
  text,
  confirmLabel,
  placeholder = "Reason (shown to the member)",
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  text: string;
  confirmLabel: string;
  placeholder?: string;
  onSubmit: (reason: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const id = useId();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const close = () => {
    if (busy) return;
    setReason("");
    setError("");
    onClose();
  };

  return (
    <Modal open={open} onClose={close} labelledBy={id}>
      <h2 id={id} className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-3 text-base leading-relaxed text-slate">{text}</p>
      <form
        noValidate
        className="mt-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const v = reason.trim();
          if (!v) return setError("Please give a reason.");
          setBusy(true);
          const ok = await onSubmit(v);
          setBusy(false);
          if (ok) {
            setReason("");
            setError("");
            onClose();
          }
        }}
      >
        <label htmlFor={`${id}-reason`} className="sr-only">Reason</label>
        <textarea
          id={`${id}-reason`}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            if (error) setError("");
          }}
          rows={3}
          maxLength={300}
          disabled={busy}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          className={`w-full resize-y rounded-xl border bg-ivory px-4 py-3 text-base ${focus} ${error ? "border-red-600" : "border-line"}`}
        />
        <p role="alert" className="mt-1 min-h-5 text-sm text-red-700">{error}</p>
        <div className="mt-3 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={close} className={secondaryBtn} disabled={busy}>Cancel</button>
          <button
            type="submit"
            disabled={busy}
            className={`inline-flex h-11 items-center justify-center rounded-xl bg-red-700 px-5 text-sm font-semibold text-white transition hover:bg-red-800 disabled:opacity-60 ${focus}`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
