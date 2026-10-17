import { formatMoney } from "@/lib/giving";

// Pure functions (no I/O): the outbox stores a template name + JSON payload, and the worker
// renders it at send time. Everything interpolated into HTML is escaped.

export type EmailTemplate =
  | "donation_receipt"
  | "donation_refunded"
  | "subscription_canceled"
  | "account_created"
  | "account_suspended"
  | "account_reinstated"
  | "role_changed"
  | "password_changed"
  | "account_deleted";

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const SITE = "Chosen Prayer";

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// Brand colours mirror src/app/globals.css (ivory / charcoal-deep / bless / cream / line / slate).
const C = { ivory: "#F7F8F6", ink: "#171918", slate: "#66706D", bless: "#FFBE00", cream: "#FFF6D6", line: "#E2E6E3" };
const FONT = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";

const shell = (title: string, bodyHtml: string, preheader = "") =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${C.ivory};font-family:${FONT};color:${C.ink}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.ivory}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 4px 20px;font-size:20px;font-weight:700;letter-spacing:-0.01em;color:${C.ink}">${SITE}<span style="color:${C.bless}">.</span></td></tr>
<tr><td style="background:#ffffff;border:1px solid ${C.line};border-radius:20px;overflow:hidden">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="background:${C.ink};height:6px;line-height:6px;font-size:0;border-bottom:4px solid ${C.bless}">&nbsp;</td></tr>
<tr><td style="padding:32px 32px 28px">
<h1 style="margin:0 0 18px;font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.01em;color:${C.ink}">${escapeHtml(title)}</h1>
${bodyHtml}
</td></tr></table></td></tr>
<tr><td style="padding:22px 8px 0;text-align:center;font-size:12px;line-height:1.6;color:${C.slate}">You are receiving this because of a contribution made on ${SITE}.<br>Thank you for being part of this community.</td></tr>
</table></td></tr></table></body></html>`;

const button = (href: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 0"><tr><td style="background:${C.bless};border-radius:12px"><a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;color:${C.ink};text-decoration:none">${escapeHtml(label)}</a></td></tr></table>`;

const outlineButton = (href: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px 0 0"><tr><td style="border:1px solid ${C.line};border-radius:12px"><a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:${C.ink};text-decoration:none">${escapeHtml(label)}</a></td></tr></table>`;

const note = (html: string) => `<p style="margin:18px 0 0;font-size:14px;line-height:1.6;color:${C.slate}">${html}</p>`;

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function renderEmail(template: string, payload: Record<string, unknown>): RenderedEmail {
  const channel = str(payload.channelName, "the channel");
  const amount = formatMoney(num(payload.amountCents), str(payload.currency, "USD"));

  switch (template as EmailTemplate) {
    case "donation_receipt": {
      const monthly = payload.frequency === "monthly";
      const date = str(payload.paidAt).slice(0, 10);
      const ref = str(payload.donationId).slice(0, 8).toUpperCase();
      const cancelUrl = monthly && /^https?:\/\//.test(str(payload.cancelUrl)) ? str(payload.cancelUrl) : "";
      const refundUrl = /^https?:\/\//.test(str(payload.refundUrl)) ? str(payload.refundUrl) : "";
      const lines = [
        ["Channel", channel],
        ["Amount", `${amount}${monthly ? " / month" : ""}`],
        ["Date", date],
        ["Reference", ref],
      ];
      return {
        subject: `Thank you for supporting ${channel}`,
        text: [
          `Thank you for supporting ${channel}.`,
          "",
          ...lines.map(([k, v]) => `${k}: ${v}`),
          "",
          ...(cancelUrl ? [`Cancel monthly support: ${cancelUrl}`, ""] : []),
          ...(refundUrl ? [`Changed your mind? Request a refund within 7 days (it goes back to the card you paid with): ${refundUrl}`, ""] : []),
          monthly ? "Your monthly support continues until you cancel it." : "This was a one-time contribution.",
          "Your contribution is voluntary and is a record of your support, not a tax document.",
        ].join("\n"),
        html: shell(
          `Thank you for supporting ${channel}`,
          `<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:${C.slate}">Your generosity makes a real difference. Here is a record of your support.</p>
<div style="background:${C.cream};border-radius:14px;padding:18px 20px;margin:0 0 18px">
<div style="font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:${C.slate}">Amount</div>
<div style="font-size:30px;font-weight:700;margin-top:4px;color:${C.ink}">${escapeHtml(amount)}${monthly ? `<span style="font-size:15px;font-weight:500;color:${C.slate}"> / month</span>` : ""}</div></div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;border-collapse:collapse">${lines
            .filter(([k]) => k !== "Amount")
            .map(([k, v]) => `<tr><td style="padding:11px 0;border-top:1px solid ${C.line};color:${C.slate}">${escapeHtml(k)}</td><td style="padding:11px 0;border-top:1px solid ${C.line};text-align:right;font-weight:600">${escapeHtml(v)}</td></tr>`)
            .join("")}</table>
${cancelUrl ? outlineButton(cancelUrl, "Cancel monthly support") : ""}
${refundUrl ? note(`Changed your mind? You can <a href="${escapeHtml(refundUrl)}" style="color:${C.ink};font-weight:600">request a refund</a> within 7 days, and it goes back to the card you paid with.`) : ""}
${note(`${monthly ? "Your monthly support continues until you cancel it." :"This was a one-time contribution."} Your contribution is voluntary and is a record of your support, not a tax document.`)}`,
          `${amount} to ${channel}`,
        ),
      };
    }
    case "donation_refunded":
      return {
        subject: `Your contribution to ${channel} was refunded`,
        text: `Your contribution of ${amount} to ${channel} has been refunded. Depending on your bank it can take a few days to appear.`,
        html: shell(
          "Your contribution was refunded",
          `<p style="margin:0;font-size:15px;line-height:1.6">Your contribution of <strong>${escapeHtml(amount)}</strong> to ${escapeHtml(channel)} has been refunded. Depending on your bank it can take a few days to appear.</p>`,
          `${amount} refunded`,
        ),
      };
    case "subscription_canceled":
      return {
        subject: `Your monthly support for ${channel} has ended`,
        text: `Your monthly support of ${amount} for ${channel} has been canceled. You will not be charged again.`,
        html: shell(
          "Your monthly support has ended",
          `<p style="margin:0;font-size:15px;line-height:1.6">Your monthly support of <strong>${escapeHtml(amount)}</strong> for ${escapeHtml(channel)} has been canceled. You will not be charged again.</p>`,
          `Monthly support for ${channel} ended`,
        ),
      };
    case "account_created": {
      const name = str(payload.name, "there");
      const role = str(payload.role, "member");
      const url = str(payload.loginUrl);
      return {
        subject: `Your ${SITE} account is ready`,
        text: [
          `Hi ${name},`,
          "",
          `An administrator created a ${role} account for you on ${SITE}.`,
          "Your administrator will share your temporary password with you separately. You will be asked to choose your own password the first time you sign in.",
          url ? `Sign in: ${url}` : "",
        ].filter(Boolean).join("\n"),
        html: shell(
          `Welcome, ${name}`,
          `<p style="margin:0;font-size:15px;line-height:1.6">An administrator created a <strong>${escapeHtml(role)}</strong> account for you on ${SITE}.</p>
${note("Your administrator will share your temporary password with you separately. You will be asked to choose your own password the first time you sign in.")}${url ? button(url, "Sign in") : ""}`,
          "Your account is ready",
        ),
      };
    }
    case "account_suspended": {
      const reason = str(payload.reason);
      return {
        subject: `Your ${SITE} account has been suspended`,
        text: `Your account has been suspended and you can't sign in for now.${reason ? `\nReason: ${reason}` : ""}\nIf you think this is a mistake, please reply to this email.`,
        html: shell(
          "Your account has been suspended",
          `<p style="margin:0;font-size:15px;line-height:1.6">Your account has been suspended and you can't sign in for now.</p>${
            reason ? `<div style="background:${C.cream};border-radius:14px;padding:14px 18px;margin:16px 0 0;font-size:14px"><strong>Reason:</strong> ${escapeHtml(reason)}</div>` : ""
          }${note("If you think this is a mistake, please reply to this email.")}`,
          "You can't sign in for now",
        ),
      };
    }
    case "account_reinstated": {
      const url = str(payload.loginUrl);
      return {
        subject: `Your ${SITE} account is active again`,
        text: `Good news: your account has been reinstated and you can sign in again.${url ? `\nSign in: ${url}` : ""}`,
        html: shell(
          "Your account is active again",
          `<p style="margin:0;font-size:15px;line-height:1.6">Good news: your account has been reinstated and you can sign in again.</p>${url ? button(url, "Sign in") : ""}`,
          "You can sign in again",
        ),
      };
    }
    case "role_changed": {
      const role = str(payload.role, "member");
      return {
        subject: `Your ${SITE} role was changed`,
        text: `Your role on ${SITE} is now: ${role}.`,
        html: shell("Your role was changed", `<p style="margin:0;font-size:15px;line-height:1.6">Your role on ${SITE} is now <strong>${escapeHtml(role)}</strong>.</p>`, `Your role is now ${role}`),
      };
    }
    case "password_changed":
      return {
        subject: `Your ${SITE} password was changed`,
        text: "Your password was just changed. If this wasn't you, reset your password right away and contact us.",
        html: shell(
          "Your password was changed",
          `<p style="margin:0;font-size:15px;line-height:1.6">Your password was just changed.</p>${note("If this wasn't you, reset your password right away and contact us.")}`,
          "Security notice",
        ),
      };
    case "account_deleted":
      return {
        subject: `Your ${SITE} account was deleted`,
        text: "Your account and its posts, comments and follows have been deleted. Contribution records are kept for financial record-keeping. We're sorry to see you go.",
        html: shell(
          "Your account was deleted",
          `<p style="margin:0;font-size:15px;line-height:1.6">Your account and its posts, comments and follows have been deleted.</p>${note("Contribution records are kept for financial record-keeping. We're sorry to see you go.")}`,
          "Account deleted",
        ),
      };
    default:
      throw new Error(`Unknown email template "${template}"`);
  }
}
