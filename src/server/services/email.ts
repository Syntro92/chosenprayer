import "server-only";
import { db, one, rows, type Queryable } from "../db";
import { errorFields, log } from "../logger";
import { getEmailSender, type EmailSender } from "../providers/email";
import { renderEmail, type EmailTemplate } from "./email-templates";

const MAX_ATTEMPTS = 5;
const STUCK_AFTER_MINUTES = 10;

/**
 * Queues an email. Call it INSIDE the transaction of the thing it announces (a paid donation),
 * so the email exists exactly when the change does: no lost emails, none for rolled-back work.
 */
export async function enqueueEmail(
  conn: Queryable,
  m: { to: string; template: EmailTemplate; payload: Record<string, unknown>; sendAfter?: Date },
): Promise<string> {
  const r = await one<{ id: string }>(
    "insert into public.email_outbox (to_email, template, payload, send_after) values ($1, $2, $3, coalesce($4, now())) returning id",
    [m.to, m.template, JSON.stringify(m.payload), m.sendAfter ?? null],
    conn,
  );
  return r!.id;
}

interface Claimed {
  id: string;
  to_email: string;
  template: string;
  payload: Record<string, unknown>;
  attempts: number;
}

/**
 * Atomically takes up to `limit` due emails (FOR UPDATE SKIP LOCKED, so concurrent workers never
 * get the same row). Rows stuck in 'sending' because a worker died are picked up again.
 */
export async function claimDue(limit: number, conn: Queryable = db, ids?: string[]): Promise<Claimed[]> {
  return rows<Claimed>(
    `with due as (
       select id from public.email_outbox
       where ((status = 'pending' and send_after <= now())
          or (status = 'sending' and locked_at < now() - make_interval(mins => $2)))
         and ($3::uuid[] is null or id = any($3::uuid[]))
       order by send_after
       limit $1
       for update skip locked
     )
     update public.email_outbox o
     set status = 'sending', locked_at = now(), attempts = o.attempts + 1
     from due where o.id = due.id
     returning o.id, o.to_email::text as to_email, o.template, o.payload, o.attempts`,
    [limit, STUCK_AFTER_MINUTES, ids ?? null],
    conn,
  );
}

export interface OutboxResult {
  claimed: number;
  sent: number;
  retrying: number;
  failed: number;
}

/**
 * Sends everything that's due (or only the given `ids`, e.g. "resend this receipt now").
 * Failures are retried with growing delays, then marked failed.
 */
export async function processOutbox(
  opts: { limit?: number; ids?: string[] } = {},
  sender: EmailSender = getEmailSender(),
  conn: Queryable = db,
): Promise<OutboxResult> {
  const batch = await claimDue(Math.min(opts.limit ?? 25, 100), conn, opts.ids);
  const result: OutboxResult = { claimed: batch.length, sent: 0, retrying: 0, failed: 0 };

  for (const item of batch) {
    try {
      const rendered = renderEmail(item.template, item.payload);
      await sender.send({ to: item.to_email, ...rendered });
      await conn.query("update public.email_outbox set status = 'sent', sent_at = now(), locked_at = null, last_error = null where id = $1", [item.id]);
      if (item.template === "donation_receipt" && typeof item.payload.donationId === "string") {
        await conn.query("update public.donations set receipt_sent_at = now() where id = $1 and receipt_sent_at is null", [item.payload.donationId]);
      }
      result.sent++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log.warn("email send failed", { id: item.id, template: item.template, attempts: item.attempts, ...errorFields(e) });
      if (item.attempts >= MAX_ATTEMPTS) {
        await conn.query("update public.email_outbox set status = 'failed', locked_at = null, last_error = left($2, 500) where id = $1", [item.id, message]);
        result.failed++;
      } else {
        // 2, 4, 8, 16 minutes
        await conn.query(
          `update public.email_outbox
           set status = 'pending', locked_at = null, last_error = left($2, 500),
               send_after = now() + make_interval(mins => $3)
           where id = $1`,
          [item.id, message, 2 ** item.attempts],
        );
        result.retrying++;
      }
    }
  }
  return result;
}

/**
 * Best-effort immediate send after a change commits, so people don't wait for the next cron run.
 * Never throws (the outbox retries anything that fails here), and does nothing inside a caller's
 * own transaction (the row isn't committed yet) or under test.
 */
export async function flushOutboxSoon(conn: Queryable = db): Promise<void> {
  if (conn !== db || process.env.NODE_ENV === "test") return;
  try {
    await processOutbox({ limit: 10 });
  } catch (e) {
    log.warn("immediate email flush failed", errorFields(e));
  }
}
