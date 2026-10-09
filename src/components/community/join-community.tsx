"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

/**
 * Frontend-only join flow. Nothing entered here is stored or sent anywhere;
 * the dialog validates the form and then explains that registration is not
 * open yet.
 */

const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-charcoal-deep focus-visible:ring-offset-2";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Step = "form" | "checking" | "soon";

const JoinContext = createContext<{ open: () => void }>({ open: () => {} });

export function JoinCommunityProvider({ children }: { children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState<Step>("form");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const uid = useId();
  const titleId = `${uid}-title`;
  const emailId = `${uid}-email`;
  const errorId = `${uid}-email-error`;
  const nameId = `${uid}-name`;

  const open = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    document.body.style.overflow = "hidden";
  }, []);

  const close = () => dialogRef.current?.close();

  // Fires for every way the dialog closes (button, Escape, backdrop).
  const handleClose = () => {
    clearTimeout(timer.current);
    document.body.style.overflow = "";
    setStep("form");
    setEmail("");
    setName("");
    setError("");
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!value) return setError("Please enter your email address.");
    if (!EMAIL_RE.test(value))
      return setError("That doesn't look like a valid email address.");
    setError("");
    setStep("checking");
    // Brief pause only so the state change is perceptible. No request is made.
    timer.current = setTimeout(() => {
      setEmail("");
      setName("");
      setStep("soon");
    }, 600);
  };

  const ctx = useMemo(() => ({ open }), [open]);

  return (
    <JoinContext.Provider value={ctx}>
      {children}
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={handleClose}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-[24px] border border-line bg-white p-0 text-charcoal-deep shadow-xl backdrop:bg-charcoal-deep/50 backdrop:backdrop-blur-[2px]"
      >
        <div className="relative p-6 sm:p-8">
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className={`absolute right-4 top-4 flex size-9 items-center justify-center rounded-xl text-slate transition-colors hover:bg-charcoal-deep/5 hover:text-charcoal-deep ${focus}`}
          >
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden>
              <path d="m4 4 10 10M14 4 4 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>

          {step !== "soon" ? (
            <>
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-bless-deep">
                Community
              </span>
              <h2 id={titleId} className="mt-3 pr-8 text-2xl font-semibold tracking-tight sm:text-3xl">
                Join the Chosen Bless Community
              </h2>
              <p className="mt-3 text-base leading-relaxed text-slate">
                Joining means becoming part of a group of people who share
                encouragement and appreciation for the work that matters to
                them. It&apos;s free, and giving is always your choice.
              </p>

              <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
                <div>
                  <label htmlFor={emailId} className="text-sm font-medium">
                    Email address
                  </label>
                  <input
                    id={emailId}
                    type="email"
                    autoComplete="email"
                    autoFocus
                    required
                    value={email}
                    disabled={step === "checking"}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError("");
                    }}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    placeholder="you@example.com"
                    className={`mt-1.5 h-12 w-full rounded-xl border bg-ivory px-4 text-base placeholder:text-slate/60 disabled:opacity-60 ${focus} ${
                      error ? "border-red-600" : "border-line hover:border-slate/50"
                    }`}
                  />
                  {error && (
                    <p id={errorId} role="alert" className="mt-1.5 text-sm text-red-700">
                      {error}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor={nameId} className="text-sm font-medium">
                    Display name <span className="font-normal text-slate">(optional)</span>
                  </label>
                  <input
                    id={nameId}
                    type="text"
                    autoComplete="nickname"
                    maxLength={40}
                    value={name}
                    disabled={step === "checking"}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="How should we greet you?"
                    className={`mt-1.5 h-12 w-full rounded-xl border border-line bg-ivory px-4 text-base placeholder:text-slate/60 hover:border-slate/50 disabled:opacity-60 ${focus}`}
                  />
                </div>

                <button
                  type="submit"
                  disabled={step === "checking"}
                  className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-bless px-6 text-sm font-semibold text-charcoal-deep shadow-sm transition hover:bg-bless-deep active:scale-[0.98] disabled:cursor-wait disabled:opacity-80 ${focus}`}
                >
                  {step === "checking" ? (
                    <>
                      <span className="size-4 animate-spin rounded-full border-2 border-charcoal-deep/30 border-t-charcoal-deep motion-reduce:animate-none" aria-hidden />
                      Checking…
                    </>
                  ) : (
                    "Continue"
                  )}
                </button>
              </form>

              <p className="mt-5 text-center text-sm text-slate">
                Already have an account?{" "}
                <Link
                  href="/signin"
                  className={`rounded font-medium text-charcoal-deep underline underline-offset-4 hover:text-bless-deep ${focus}`}
                >
                  Sign In
                </Link>
              </p>
              <p className="mt-4 border-t border-line pt-4 text-xs leading-relaxed text-slate">
                Nothing you enter here is saved or sent yet. When community
                registration opens, we&apos;ll handle your details as described
                in our{" "}
                <Link
                  href="/privacy"
                  className={`rounded underline underline-offset-2 hover:text-charcoal-deep ${focus}`}
                >
                  Privacy Policy
                </Link>
                .
              </p>
            </>
          ) : (
            <div className="text-center">
              <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-cream" aria-hidden>
                <svg width="28" height="28" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-charcoal-deep">
                  <circle cx="24" cy="24" r="14" />
                  <path d="M24 16v9l6 3" />
                </svg>
              </div>
              <h2 id={titleId} className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">
                Community registration is coming soon
              </h2>
              <p className="mt-3 text-base leading-relaxed text-slate" role="status">
                Thank you for your interest. We&apos;re not accepting sign-ups
                yet, so no account has been created and we haven&apos;t kept
                your details. Please check back soon.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Link
                  href="/channels"
                  onClick={close}
                  className={`inline-flex h-12 items-center justify-center rounded-xl bg-bless px-6 text-sm font-semibold text-charcoal-deep shadow-sm transition hover:bg-bless-deep active:scale-[0.98] ${focus}`}
                >
                  Explore Channels
                </Link>
                <button
                  type="button"
                  onClick={close}
                  className={`inline-flex h-12 items-center justify-center rounded-xl border border-charcoal-deep/20 px-6 text-sm font-semibold transition hover:border-charcoal-deep hover:bg-ivory ${focus}`}
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </dialog>
    </JoinContext.Provider>
  );
}

export function JoinCommunityButton({
  children = "Join the Community",
  className = "",
}: {
  children?: ReactNode;
  className?: string;
}) {
  const { open } = useContext(JoinContext);
  return (
    <button type="button" onClick={open} aria-haspopup="dialog" className={className}>
      {children}
    </button>
  );
}
