import type { ErrorBody } from "@/server/errors";

/**
 * What a form-driven Server Action returns to `useActionState`.
 * `values` echoes non-secret inputs back so a failed submit doesn't wipe them
 * (React resets uncontrolled inputs after every action).
 */
export type FormState = {
  ok: boolean;
  error?: ErrorBody;
  message?: string;
  values?: Record<string, string>;
} | null;

export const fieldError = (state: FormState, name: string): string | undefined => state?.error?.fields?.[name];
