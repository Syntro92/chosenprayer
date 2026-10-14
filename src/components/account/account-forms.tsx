"use client";

import { useActionState, useId } from "react";
import { changePasswordAction, deleteAccountAction, updateProfileAction } from "@/actions/account";
import { TONE_CLASS } from "@/lib/avatar";
import { fieldError, type FormState } from "@/lib/forms";
import { LANGUAGES } from "@/lib/languages";
import { AVATAR_TONES } from "@/lib/schemas/accounts";
import type { MyProfile } from "@/server/services/accounts";

const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-charcoal-deep focus-visible:ring-offset-2";
const input = `h-12 w-full rounded-xl border border-line bg-white px-4 text-base text-charcoal-deep placeholder:text-slate/60 transition focus:border-bless focus:outline-none focus:ring-2 focus:ring-bless/40 aria-[invalid=true]:border-red-600`;
const primaryBtn = `inline-flex h-11 items-center justify-center rounded-xl bg-bless px-6 text-sm font-semibold text-charcoal-deep shadow-sm transition hover:bg-bless-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${focus}`;
const dangerBtn = `inline-flex h-11 items-center justify-center rounded-xl bg-red-700 px-6 text-sm font-semibold text-white transition hover:bg-red-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${focus}`;
const card = "rounded-[28px] border border-line bg-white p-6 shadow-sm sm:p-8";

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: (p: { id: string; invalid: boolean; describedBy?: string }) => React.ReactNode;
}) {
  const id = useId();
  const describedBy = error ? `${id}-e` : hint ? `${id}-h` : undefined;
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-charcoal-deep">
        {label}
      </label>
      <div className="mt-2">{children({ id, invalid: !!error, describedBy })}</div>
      {error ? (
        <p id={`${id}-e`} className="mt-1.5 text-sm text-red-700">{error}</p>
      ) : hint ? (
        <p id={`${id}-h`} className="mt-1.5 text-sm text-slate">{hint}</p>
      ) : null}
    </div>
  );
}

function Status({ state }: { state: FormState }) {
  if (!state) return null;
  if (state.ok) return <p role="status" className="text-sm font-medium text-charcoal-deep">{state.message}</p>;
  if (state.error && !state.error.fields) return <p role="alert" className="text-sm text-red-700">{state.error.message}</p>;
  return null;
}

export function ProfileForm({ profile }: { profile: MyProfile }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateProfileAction, null);
  const v = state?.values;
  return (
    <section className={card} aria-labelledby="profile-h">
      <h2 id="profile-h" className="text-xl font-semibold tracking-tight text-charcoal-deep">Profile</h2>
      <p className="mt-1 text-sm text-slate">Signed in as {profile.email}</p>
      <form action={action} className="mt-6 space-y-5">
        <Field label="Display name" error={fieldError(state, "displayName")}>
          {({ id, invalid, describedBy }) => (
            <input id={id} name="displayName" required maxLength={80} defaultValue={v?.displayName ?? profile.displayName}
              aria-invalid={invalid} aria-describedby={describedBy} className={input} />
          )}
        </Field>
        <Field label="Username" error={fieldError(state, "username")} hint="Letters, numbers and underscores. This is your public handle.">
          {({ id, invalid, describedBy }) => (
            <input id={id} name="username" required minLength={3} maxLength={30} defaultValue={v?.username ?? profile.username}
              autoCapitalize="none" spellCheck={false} aria-invalid={invalid} aria-describedby={describedBy} className={input} />
          )}
        </Field>
        <Field label="Bio" error={fieldError(state, "bio")} hint="Up to 300 characters.">
          {({ id, invalid, describedBy }) => (
            <textarea id={id} name="bio" rows={3} maxLength={300} defaultValue={v?.bio ?? profile.bio}
              aria-invalid={invalid} aria-describedby={describedBy}
              className={`${input} h-auto resize-y py-3`} />
          )}
        </Field>
        <fieldset>
          <legend className="text-sm font-medium text-charcoal-deep">Avatar colour</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {AVATAR_TONES.map((t) => (
              <label key={t} className="cursor-pointer">
                <input type="radio" name="avatarTone" value={t} defaultChecked={(v?.avatarTone ?? profile.avatarTone) === t} className="peer sr-only" />
                <span className={`block size-11 rounded-full border border-line ${TONE_CLASS[t]} peer-checked:ring-2 peer-checked:ring-charcoal-deep peer-checked:ring-offset-2 peer-focus-visible:ring-2 peer-focus-visible:ring-charcoal-deep`} />
                <span className="sr-only">{t}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Language" error={fieldError(state, "locale")}>
          {({ id, invalid, describedBy }) => (
            <select id={id} name="locale" defaultValue={v?.locale ?? profile.locale} aria-invalid={invalid} aria-describedby={describedBy} className={input} translate="no">
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          )}
        </Field>
        <div className="flex items-center gap-4">
          <button type="submit" disabled={pending} className={primaryBtn}>{pending ? "Saving…" : "Save profile"}</button>
          <Status state={state} />
        </div>
      </form>
    </section>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changePasswordAction, null);
  return (
    <section className={card} aria-labelledby="password-h">
      <h2 id="password-h" className="text-xl font-semibold tracking-tight text-charcoal-deep">Password</h2>
      <form action={action} key={state?.ok ? "done" : "form"} className="mt-6 space-y-5">
        <Field label="New password" error={fieldError(state, "password")} hint="At least 8 characters.">
          {({ id, invalid, describedBy }) => (
            <input id={id} name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password"
              aria-invalid={invalid} aria-describedby={describedBy} className={input} />
          )}
        </Field>
        <Field label="Confirm new password" error={fieldError(state, "confirm")}>
          {({ id, invalid, describedBy }) => (
            <input id={id} name="confirm" type="password" required autoComplete="new-password"
              aria-invalid={invalid} aria-describedby={describedBy} className={input} />
          )}
        </Field>
        <div className="flex items-center gap-4">
          <button type="submit" disabled={pending} className={primaryBtn}>{pending ? "Updating…" : "Update password"}</button>
          <Status state={state} />
        </div>
      </form>
    </section>
  );
}

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(deleteAccountAction, null);
  return (
    <section className={`${card} border-red-200`} aria-labelledby="delete-h">
      <h2 id="delete-h" className="text-xl font-semibold tracking-tight text-charcoal-deep">Delete account</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate">
        This permanently removes your profile, posts, comments and follows. Donations you&apos;ve made are kept as
        financial records but are no longer linked to you. This can&apos;t be undone.
      </p>
      <form action={action} className="mt-6 space-y-5">
        <Field label="Confirm with your password" error={fieldError(state, "password")}>
          {({ id, invalid, describedBy }) => (
            <input id={id} name="password" type="password" required autoComplete="current-password"
              aria-invalid={invalid} aria-describedby={describedBy} className={input} />
          )}
        </Field>
        <div className="flex items-center gap-4">
          <button type="submit" disabled={pending} className={dangerBtn}>{pending ? "Deleting…" : "Delete my account"}</button>
          <Status state={state} />
        </div>
      </form>
    </section>
  );
}
