import "server-only";
import { givingSettingsSchema } from "@/lib/schemas/admin";
import { requireRole, type Actor } from "../auth/policy";
import { db, inTransaction, one, type Queryable } from "../db";
import { AppError } from "../errors";
import { audit } from "./audit";

/** Site-wide support settings (Admin > Channels > Support settings). Apply to every channel. */
export interface GivingSettings {
  /** Smallest gift anyone can make, in whole currency units. */
  minDonation: number;
  /** Quick-pick amounts on the Support card, ascending. */
  presets: number[];
  /** Whether channel pages list their top supporters. */
  showTopSupporters: boolean;
  /** Whether channel pages list their latest supporters ("5 minutes ago"). */
  showRecentSupporters: boolean;
}

/** Public read (no role): the channel page and the donation flow both need these. */
export async function readGivingSettings(conn: Queryable = db): Promise<GivingSettings> {
  const r = await one<{ min_donation: number; giving_presets: number[]; show_top_supporters: boolean; show_recent_supporters: boolean }>(
    "select min_donation, giving_presets, show_top_supporters, show_recent_supporters from public.site_settings where id",
    [],
    conn,
  );
  if (!r) throw new AppError("INTERNAL", "Site settings are missing.");
  return {
    minDonation: r.min_donation,
    presets: r.giving_presets,
    showTopSupporters: r.show_top_supporters,
    showRecentSupporters: r.show_recent_supporters,
  };
}

export async function getGivingSettings(actor: Actor | null, conn: Queryable = db): Promise<GivingSettings> {
  requireRole(actor, "admin");
  return readGivingSettings(conn);
}

export async function updateGivingSettings(actor: Actor | null, raw: unknown, conn: Queryable = db): Promise<GivingSettings> {
  const a = requireRole(actor, "admin");
  const input = givingSettingsSchema.parse(raw);
  return inTransaction(conn, async (c) => {
    const before = await readGivingSettings(c);
    await c.query(
      "update public.site_settings set min_donation = $1, giving_presets = $2, show_top_supporters = $3, show_recent_supporters = $4, updated_by = $5 where id",
      [input.minDonation, input.presets, input.showTopSupporters, input.showRecentSupporters, a.userId],
    );
    const changed = (["minDonation", "presets", "showTopSupporters", "showRecentSupporters"] as const).filter(
      (k) => JSON.stringify(before[k]) !== JSON.stringify(input[k]),
    );
    if (changed.length) await audit(c, { actorId: a.userId, action: "setting.update", entityType: "setting", entityId: "giving", metadata: { fields: changed } });
    return readGivingSettings(c);
  });
}
