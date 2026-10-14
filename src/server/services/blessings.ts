import "server-only";
import { blessingSchema } from "@/lib/schemas/giving";
import type { Actor } from "../auth/policy";
import { db, inTransaction, type Queryable } from "../db";
import { AppError } from "../errors";
import { enforceRateLimit } from "../rate-limit";
import { loadAuthorizedDonation } from "./giving";
import { notify } from "./notifications";

/** A blessing as the channel page shows it (same shape as the public feed). */
export interface BlessingResult {
  /** Which channel page this blessing belongs on (callers use it to refresh caches). */
  channelHandle: string;
  id: string;
  name: string;
  message: string;
  date: string; // YYYY-MM-DD
  amount?: number; // whole currency units, only if the supporter chose to show it
}

/**
 * Leave a thank-you message on a confirmed gift. Allowed for the donor (signed in) or anyone
 * holding the donation's secret token (guests); once per donation. The supporter chooses
 * whether to appear by name and whether to show the amount; the public feed enforces both.
 */
export async function createBlessing(actor: Actor | null, raw: unknown, conn: Queryable = db): Promise<BlessingResult> {
  const input = blessingSchema.parse(raw);
  const d = await loadAuthorizedDonation(actor, input.donationId, input.token, conn);
  await enforceRateLimit("blessing", actor?.userId ?? d.id, conn);

  if (d.status !== "succeeded") {
    throw new AppError("CONFLICT", "Your gift hasn't been confirmed yet. Please try again in a moment.");
  }
  if (!d.channel_show_blessings) throw new AppError("CONFLICT", "This channel isn't taking blessings right now.");
  if (d.has_blessing) throw new AppError("CONFLICT", "You've already left a blessing for this gift.");

  const shownName = input.displayName || actor?.displayName || d.donor_name || null;
  const anonymous = input.anonymous || !shownName;

  let created: string;
  try {
    created = await inTransaction(conn, async (c) => {
    const { rows: [b] } = await c.query<{ id: string }>(
      `insert into public.blessings (donation_id, channel_id, author_id, display_name, is_anonymous, message, show_amount)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [d.id, d.channel_id, actor?.userId ?? d.donor_id, anonymous ? null : shownName, anonymous, input.message, input.showAmount],
    );
    if (d.owner_id) {
      await notify(c, {
        userId: d.owner_id,
        actorId: actor?.userId ?? d.donor_id,
        type: "blessing",
        text: `${anonymous ? "Someone" : shownName} left a blessing for ${d.channel_name}`,
        href: `/channels/${d.channel_handle}#blessings`,
      });
    }
    return b.id;
    });
  } catch (e) {
    // Two submissions at once: the database allows only one blessing per gift.
    if ((e as { code?: string }).code === "23505") throw new AppError("CONFLICT", "You've already left a blessing for this gift.");
    throw e;
  }

  return {
    channelHandle: d.channel_handle,
    id: created,
    name: anonymous ? "Anonymous" : shownName!,
    message: input.message,
    date: new Date().toISOString().slice(0, 10),
    ...(input.showAmount ? { amount: d.amount_cents / 100 } : {}),
  };
}
