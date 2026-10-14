"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  forgotPasswordAction,
  resetPasswordAction,
  signInAction,
  signUpAction,
} from "@/actions/auth";
import { fieldError, type FormState } from "@/lib/forms";

export type AuthMode = "signin" | "signup" | "forgot" | "reset";

const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-charcoal-deep focus-visible:ring-offset-2";
const inputBase = `h-12 w-full rounded-xl border bg-white px-4 text-base text-charcoal-deep placeholder:text-slate/60 transition focus:outline-none focus:ring-2`;
const inputOk = `border-line focus:border-bless focus:ring-bless/40`;
const inputBad = `border-red-600 focus:border-red-600 focus:ring-red-600/30`;
const primaryBtn = `inline-flex h-12 w-full items-center justify-center rounded-xl bg-bless px-6 text-sm font-semibold text-charcoal-deep shadow-sm transition hover:bg-bless-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${focus}`;

const COPY = {
  signin: {
    eyebrow: "Welcome back",
    title: "Sign in to Chosen Prayer",
    text: "Pick up where you left off with the channels and community you care about.",
    cta: "Sign In",
    pending: "Signing in…",
    alt: { text: "New here?", label: "Create an account", href: "/signup" },
  },
  signup: {
    eyebrow: "Join us",
    title: "Create your account",
    text: "Join a community built around encouragement, appreciation and meaningful support.",
    cta: "Create Account",
    pending: "Creating account…",
    alt: { text: "Already have an account?", label: "Sign in", href: "/signin" },
  },
  forgot: {
    eyebrow: "Reset password",
    title: "Forgot your password?",
    text: "Enter your email and we'll send you a link to choose a new one.",
    cta: "Send Reset Link",
    pending: "Sending…",
    alt: { text: "Remembered it?", label: "Back to sign in", href: "/signin" },
  },
  reset: {
    eyebrow: "Almost done",
    title: "Choose a new password",
    text: "Pick something you haven't used before. You'll be signed in right after.",
    cta: "Save Password",
    pending: "Saving…",
    alt: null,
  },
} as const;

const ACTIONS = {
  signin: signInAction,
  signup: signUpAction,
  forgot: forgotPasswordAction,
  reset: resetPasswordAction,
} as const;

function Field({
  label,
  error,
  children,
  hint,
}: {
  label: string;
  error?: string;
  children: (p: { id: string; invalid: boolean; describedBy?: string }) => React.ReactNode;
  hint?: React.ReactNode;
}) {
  const id = useId();
  const errId = `${id}-error`;
  return (
    <div>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium text-charcoal-deep">
          {label}
        </label>
        {hint}
      </div>
      <div className="mt-2">{children({ id, invalid: !!error, describedBy: error ? errId : undefined })}</div>
      {error && (
        <p id={errId} className="mt-1.5 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function PasswordInput({
  id,
  name,
  mode,
  invalid,
  describedBy,
  placeholder,
}: {
  id: string;
  name: string;
  mode: "current" | "new";
  invalid: boolean;
  describedBy?: string;
  placeholder: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={show ? "text" : "password"}
        autoComplete={mode === "current" ? "current-password" : "new-password"}
        required
        minLength={mode === "new" ? 8 : undefined}
        placeholder={placeholder}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={`${inputBase} ${invalid ? inputBad : inputOk} pr-12`}
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
  );
}

export function AuthForm({ mode, next, notice }: { mode: AuthMode; next?: string; notice?: string }) {
  const c = COPY[mode];
  const [state, formAction, pending] = useActionState<FormState, FormData>(ACTIONS[mode], null);
  const values = state?.values ?? {};

  // Message-only outcomes replace the form (check-your-inbox screens).
  const done = state?.ok ? state.message : undefined;
  const formLevelError =
    state && !state.ok && state.error && !state.error.fields ? state.error : undefined;

  return (
    <div className="w-full max-w-md rounded-[28px] border border-line bg-white p-6 shadow-sm sm:p-10">
      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-bless-deep">{c.eyebrow}</span>
      <h1 className="mt-3 text-3xl font-semibold leading-[1.1] tracking-tight text-charcoal-deep sm:text-4xl">{c.title}</h1>
      <p className="mt-3 text-base leading-relaxed text-slate">{c.text}</p>
      {notice && (
        <p role="status" className="mt-5 rounded-xl bg-cream px-4 py-3 text-sm leading-relaxed text-charcoal-deep">
          {notice}
        </p>
      )}

      {done ? (
        <div role="status" className="mt-8 rounded-xl bg-cream px-4 py-4 text-sm leading-relaxed text-charcoal-deep">
          {done}
        </div>
      ) : (
        <form action={formAction} className="mt-8 space-y-5" noValidate={false}>
          {next && <input type="hidden" name="next" value={next} />}
          {mode === "signup" && (
            // Honeypot: invisible to people, tempting to form-filling bots. Real users never fill it.
            <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>
                Company
                <input name="company" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
              </label>
            </div>
          )}

          {mode === "signup" && (
            <Field label="Full name" error={fieldError(state, "fullName")}>
              {({ id, invalid, describedBy }) => (
                <input
                  id={id}
                  name="fullName"
                  type="text"
                  autoComplete="name"
                  required
                  maxLength={80}
                  defaultValue={values.fullName}
                  placeholder="Your name"
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                  className={`${inputBase} ${invalid ? inputBad : inputOk}`}
                />
              )}
            </Field>
          )}

          {mode !== "reset" && (
            <Field label="Email" error={fieldError(state, "email")}>
              {({ id, invalid, describedBy }) => (
                <input
                  id={id}
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  defaultValue={values.email}
                  placeholder="you@example.com"
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                  className={`${inputBase} ${invalid ? inputBad : inputOk}`}
                />
              )}
            </Field>
          )}

          {mode !== "forgot" && (
            <Field
              label={mode === "reset" ? "New password" : "Password"}
              error={fieldError(state, "password")}
              hint={
                mode === "signin" ? (
                  <Link
                    href="/forgot-password"
                    className={`rounded text-sm font-medium text-slate underline-offset-4 hover:text-charcoal-deep hover:underline ${focus}`}
                  >
                    Forgot password?
                  </Link>
                ) : null
              }
            >
              {({ id, invalid, describedBy }) => (
                <PasswordInput
                  id={id}
                  name="password"
                  mode={mode === "signin" ? "current" : "new"}
                  invalid={invalid}
                  describedBy={describedBy}
                  placeholder={mode === "signin" ? "Your password" : "At least 8 characters"}
                />
              )}
            </Field>
          )}

          {mode === "reset" && (
            <Field label="Confirm new password" error={fieldError(state, "confirm")}>
              {({ id, invalid, describedBy }) => (
                <PasswordInput id={id} name="confirm" mode="new" invalid={invalid} describedBy={describedBy} placeholder="Repeat the password" />
              )}
            </Field>
          )}

          {mode === "signup" && (
            <p className="text-sm leading-relaxed text-slate">
              By creating an account you agree to be kind and to keep this a welcoming place for everyone.
            </p>
          )}

          <button type="submit" disabled={pending} className={primaryBtn}>
            {pending ? c.pending : c.cta}
          </button>

          {formLevelError && (
            <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
              {formLevelError.message}
            </div>
          )}
          {state && !state.ok && state.error?.fields && Object.keys(state.error.fields).length > 0 && !formLevelError && (
            <p role="alert" className="sr-only">
              {state.error.message}
            </p>
          )}
        </form>
      )}

      {c.alt && (
        <p className="mt-8 text-center text-sm text-slate">
          {c.alt.text}{" "}
          <Link
            href={c.alt.href}
            className={`rounded font-semibold text-charcoal-deep underline decoration-bless decoration-2 underline-offset-4 ${focus}`}
          >
            {c.alt.label}
          </Link>
        </p>
      )}
    </div>
  );
}
