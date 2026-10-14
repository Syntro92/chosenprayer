import "server-only";
import { getEnv } from "../../env";
import { AppError } from "../../errors";
import { log } from "../../logger";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailSender {
  readonly name: "console" | "resend" | "mailtrap";
  send(message: EmailMessage): Promise<void>;
}

/** j***@example.com: enough to recognise in a log, not enough to harvest. */
export const maskEmail = (email: string) => email.replace(/^(.).*(@.*)$/, "$1***$2");

/** Development sender: prints the email to the server console instead of sending it. */
export const consoleSender: EmailSender = {
  name: "console",
  async send(m) {
    log.info("email (console sender; nothing was sent)", { to: maskEmail(m.to), subject: m.subject });
    // The full body is printed plainly so you can read receipts while developing.
    console.log(`\n--- EMAIL to ${m.to} --------------------------\nSubject: ${m.subject}\n\n${m.text}\n------------------------------------------------\n`);
  },
};

/** Mailtrap Email Sending API (https://api-docs.mailtrap.io). Needs a verified sending domain. */
function mailtrapSender(token: string, from: { email: string; name: string }): EmailSender {
  return {
    name: "mailtrap",
    async send(m) {
      const res = await fetch("https://send.api.mailtrap.io/api/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [{ email: m.to }],
          subject: m.subject,
          text: m.text,
          html: m.html,
          category: "chosenprayer",
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        // Status only: the response can echo recipient details.
        log.error("mailtrap send failed", { to: maskEmail(m.to), status: res.status });
        throw new AppError("UNAVAILABLE", "Email isn't available right now.");
      }
    },
  };
}

export function getEmailSender(): EmailSender {
  const env = getEnv();
  if (env.EMAIL_PROVIDER === "console") return consoleSender;
  if (env.EMAIL_PROVIDER === "mailtrap") {
    return mailtrapSender(env.MAILTRAP_API_TOKEN!, { email: env.EMAIL_FROM!, name: env.EMAIL_FROM_NAME });
  }
  // The Resend adapter arrives in M8 (needs the email account).
  throw new AppError("UNAVAILABLE", "Email isn't available right now.");
}
