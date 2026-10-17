import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "../env";
import { UUID_RE } from "./community-shared";

// A signed link lets a supporter cancel straight from the payment email, even if they gave as a
// guest and have no account. The link only identifies the subscription (it can't do anything else),
// and the cancel itself is a button press on the page, never a GET, so mail scanners can't trigger it.

const sign = (subscriptionId: string) =>
  createHmac("sha256", getEnv().CRON_SECRET).update(`subscription-cancel:${subscriptionId}`).digest("base64url");

export function subscriptionCancelUrl(subscriptionId: string): string {
  return `${getEnv().APP_URL}/subscription/cancel?token=${subscriptionId}.${sign(subscriptionId)}`;
}

/** Returns the subscription id if the token is genuine, otherwise null. */
export function verifyCancelToken(token: string | undefined): string | null {
  const [id, sig, extra] = (token ?? "").split(".");
  if (!id || !sig || extra !== undefined || !UUID_RE.test(id)) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(id));
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

// Same idea for refunds: the receipt email carries a signed link to a confirm page, so guests (no
// account) can ask for their money back. The link only identifies the donation; the refund is a
// button press on the page, never a GET. The signature domain differs, so a cancel token can't be
// replayed as a refund token (or the other way round).

const signRefund = (donationId: string) =>
  createHmac("sha256", getEnv().CRON_SECRET).update(`donation-refund:${donationId}`).digest("base64url");

export function donationRefundUrl(donationId: string): string {
  return `${getEnv().APP_URL}/donation/refund?token=${donationId}.${signRefund(donationId)}`;
}

/** Returns the donation id if the token is genuine, otherwise null. */
export function verifyRefundToken(token: string | undefined): string | null {
  const [id, sig, extra] = (token ?? "").split(".");
  if (!id || !sig || extra !== undefined || !UUID_RE.test(id)) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(signRefund(id));
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}
