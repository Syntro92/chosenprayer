import "server-only";
import { settingsSchema } from "@/lib/schemas/admin";
import { requireRole, type Actor } from "../auth/policy";
import { db, inTransaction, one, type Queryable } from "../db";
import { AppError } from "../errors";
import { audit } from "./audit";

export interface SiteSettings {
  siteName: string;
  contactEmail: string | null;
  defaultCurrency: string;
  notifyOnDonation: boolean;
  updatedAt: string;
}

const readSettings = async (conn: Queryable): Promise<SiteSettings> => {
  const r = await one<{ site_name: string; contact_email: string | null; default_currency: string; notify_on_donation: boolean; updated_at: string }>(
    "select site_name, contact_email::text as contact_email, default_currency::text as default_currency, notify_on_donation, updated_at::text as updated_at from public.site_settings where id",
    [],
    conn,
  );
  if (!r) throw new AppError("INTERNAL", "Site settings are missing.");
  return {
    siteName: r.site_name,
    contactEmail: r.contact_email,
    defaultCurrency: r.default_currency,
    notifyOnDonation: r.notify_on_donation,
    updatedAt: new Date(r.updated_at).toISOString(),
  };
};

export async function getSettings(actor: Actor | null, conn: Queryable = db): Promise<SiteSettings> {
  requireRole(actor, "admin");
  return readSettings(conn);
}

export async function updateSettings(actor: Actor | null, raw: unknown, conn: Queryable = db): Promise<SiteSettings> {
  const a = requireRole(actor, "admin");
  const input = settingsSchema.parse(raw);
  return inTransaction(conn, async (c) => {
    const before = await readSettings(c);
    await c.query(
      "update public.site_settings set site_name = $1, contact_email = $2, default_currency = $3, notify_on_donation = $4, updated_by = $5 where id",
      [input.siteName, input.contactEmail, input.defaultCurrency, input.notifyOnDonation, a.userId],
    );
    const changed = (["siteName", "contactEmail", "defaultCurrency", "notifyOnDonation"] as const).filter((k) => before[k] !== input[k]);
    if (changed.length) await audit(c, { actorId: a.userId, action: "setting.update", entityType: "setting", entityId: "site", metadata: { fields: changed } });
    return readSettings(c);
  });
}
