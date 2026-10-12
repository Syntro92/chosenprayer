"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";

type Mode = "signin" | "signup";

const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-charcoal-deep focus-visible:ring-offset-2";
const input = `h-12 w-full rounded-xl border border-line bg-white px-4 text-base text-charcoal-deep placeholder:text-slate/60 transition focus:border-bless focus:outline-none focus:ring-2 focus:ring-bless/40`;
const primaryBtn = `inline-flex h-12 w-full items-center justify-center rounded-xl bg-bless px-6 text-sm font-semibold text-charcoal-deep shadow-sm transition hover:bg-bless-deep active:scale-[0.98] ${focus}`;

const COPY = {
  signin: {
    eyebrow: "Welcome back",
    title: "Sign in to Chosen Prayer",
    text: "Pick up where you left off with the channels and community you care about.",
    cta: "Sign In",
    alt: { text: "New here?", label: "Create an account", href: "/signup" },
  },
  signup: {
    eyebrow: "Join us",
    title: "Create your account",
    text: "Join a community built around encouragement, appreciation and meaningful support.",
    cta: "Create Account",
    alt: { text: "Already have an account?", label: "Sign in", href: "/signin" },
  },
} as const;

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: (id: string) => React.ReactNode;
  hint?: React.ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium text-charcoal-deep">
          {label}
        </label>
        {hint}
      </div>
      <div className="mt-2">{children(id)}</div>
    </div>
  );
}

export function AuthForm({ mode }: { mode: Mode }) {
  const c = COPY[mode];
  const [show, setShow] = useState(false);
  const [notice, setNotice] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    // Accounts are not wired up yet.
    setNotice(true);
  }

  return (
    <div className="w-full max-w-md rounded-[28px] border border-line bg-white p-6 shadow-sm sm:p-10">
      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-bless-deep">
        {c.eyebrow}
      </span>
      <h1 className="mt-3 text-3xl font-semibold leading-[1.1] tracking-tight text-charcoal-deep sm:text-4xl">
        {c.title}
      </h1>
      <p className="mt-3 text-base leading-relaxed text-slate">{c.text}</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
        {mode === "signup" && (
          <Field label="Full name">
            {(id) => (
              <input id={id} name="name" type="text" autoComplete="name" required placeholder="Your name" className={input} />
            )}
          </Field>
        )}

        <Field label="Email">
          {(id) => (
            <input id={id} name="email" type="email" autoComplete="email" required placeholder="you@example.com" className={input} />
          )}
        </Field>

        <Field
          label="Password"
          hint={
            mode === "signin" ? (
              <Link href="/signin" className={`rounded text-sm font-medium text-slate underline-offset-4 hover:text-charcoal-deep hover:underline ${focus}`}>
                Forgot password?
              </Link>
            ) : null
          }
        >
          {(id) => (
            <div className="relative">
              <input
                id={id}
                name="password"
                type={show ? "text" : "password"}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                minLength={8}
                placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
                className={`${input} pr-12`}
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? "Hide password" : "Show password"}
                aria-pressed={show}
                className={`absolute right-2 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate transition hover:text-charcoal-deep ${focus}`}
              >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          )}
        </Field>

        {mode === "signup" && (
          <p className="text-sm leading-relaxed text-slate">
            By creating an account you agree to be kind and to keep this a welcoming place for everyone.
          </p>
        )}

        <button type="submit" className={primaryBtn}>
          {c.cta}
        </button>

        {notice && (
          <p role="status" className="rounded-xl bg-cream px-4 py-3 text-center text-sm text-charcoal-deep">
            Accounts aren&apos;t available just yet. Please check back soon.
          </p>
        )}
      </form>

      <p className="mt-8 text-center text-sm text-slate">
        {c.alt.text}{" "}
        <Link href={c.alt.href} className={`rounded font-semibold text-charcoal-deep underline decoration-bless decoration-2 underline-offset-4 ${focus}`}>
          {c.alt.label}
        </Link>
      </p>
    </div>
  );
}
