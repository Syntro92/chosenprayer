import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getPool, type Queryable } from "@/server/db";
import { toAppError } from "@/server/errors";
import { listAuditLog } from "@/server/services/audit";
import { getChannelProfile } from "@/server/services/channels";
import { getGivingConfig, startDonation } from "@/server/services/giving";
import { getGivingSettings, readGivingSettings, updateGivingSettings } from "@/server/services/giving-settings";
import { channel, FakeProvider, member } from "../helpers/fixtures";
import { withRollback } from "../helpers/rollback";

afterAll(async () => {
  await getPool().end();
});

// The real database may hold settings an admin has edited; start every test from the column defaults.
const resetSettings = (c: Queryable) =>
  c.query("update public.site_settings set min_donation = default, giving_presets = default, show_top_supporters = default where id", []);
const admin = (c: Queryable) => member(c, { role: "admin", name: "Ada Admin" });
const settings = (over: Record<string, unknown> = {}) => ({ minDonation: 25, presets: [25, 55, 111], showTopSupporters: false, ...over });
async function invalid(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return toAppError(e);
  }
  throw new Error("expected a rejection");
}

describe("site-wide support settings", () => {
  it("start with the original defaults", () =>
    withRollback(async (c) => {
      await resetSettings(c);
      expect(await readGivingSettings(c)).toEqual({ minDonation: 25, presets: [25, 55, 111, 555, 999], showTopSupporters: false });
    }));

  it("are admin-only", () =>
    withRollback(async (c) => {
      const m = await member(c);
      expect(await invalid(getGivingSettings(m, c))).toMatchObject({ code: "FORBIDDEN" });
      expect(await invalid(updateGivingSettings(m, settings(), c))).toMatchObject({ code: "FORBIDDEN" });
      expect(await invalid(updateGivingSettings(null, settings(), c))).toMatchObject({ code: "UNAUTHENTICATED" });
    }));

  it("are saved sorted and de-duplicated, and the change is audited", () =>
    withRollback(async (c) => {
      const a = await admin(c);
      const out = await updateGivingSettings(a, settings({ minDonation: 10, presets: [100, 50, 50, 10], showTopSupporters: true }), c);
      expect(out).toEqual({ minDonation: 10, presets: [10, 50, 100], showTopSupporters: true });
      expect(await getGivingSettings(a, c)).toEqual(out);
      const log = await listAuditLog(a, { entityType: "setting" }, c);
      expect(log.items.some((i) => i.action === "setting.update" && (i.metadata.fields as string[]).includes("presets"))).toBe(true);
    }));

  it.each([
    ["no amounts", { presets: [] }],
    ["more than five amounts", { presets: [25, 30, 35, 40, 45, 50] }],
    ["a fraction", { presets: [25.5] }],
    ["not a number", { presets: ["x"] }],
    ["an amount below the minimum donation", { minDonation: 50, presets: [25, 100] }],
    ["a zero minimum", { minDonation: 0, presets: [25] }],
    ["a huge minimum", { minDonation: 1_000_000, presets: [25] }],
    ["a non-boolean switch", { showTopSupporters: "yes" }],
  ])("reject %s", (_name, bad) =>
    withRollback(async (c) => {
      await resetSettings(c);
      const a = await admin(c);
      expect(await invalid(updateGivingSettings(a, settings(bad), c))).toMatchObject({ code: "VALIDATION" });
      expect((await readGivingSettings(c)).presets).toEqual([25, 55, 111, 555, 999]); // nothing saved
    }));

  it("reach every channel page and the giving config", () =>
    withRollback(async (c) => {
      const a = await admin(c);
      const one = await channel(c, { name: "One" });
      const two = await channel(c, { name: "Two" });
      await updateGivingSettings(a, settings({ minDonation: 5, presets: [5, 20], showTopSupporters: true }), c);
      for (const ch of [one, two]) {
        expect((await getChannelProfile(ch.handle, c)).data).toMatchObject({ givingPresets: [5, 20], showTopSupporters: true });
      }
      expect(await getGivingConfig(c)).toMatchObject({ minAmount: 5 });
    }));

  it("set the smallest gift the server accepts", () =>
    withRollback(async (c) => {
      const a = await admin(c);
      const ch = await channel(c);
      const give = (amount: number) =>
        startDonation(null, { channelHandle: ch.handle, amount, frequency: "once", donorEmail: "g@example.com", idempotencyKey: randomUUID() }, { ip: `t-${randomUUID()}` }, c, new FakeProvider());

      await updateGivingSettings(a, settings({ minDonation: 40, presets: [40, 80] }), c);
      expect(await invalid(give(39))).toMatchObject({ code: "VALIDATION", fields: { amount: "The minimum is 40" } });
      await expect(give(40)).resolves.toMatchObject({ donationId: expect.any(String) });

      await updateGivingSettings(a, settings({ minDonation: 5, presets: [5] }), c);
      await expect(give(5)).resolves.toMatchObject({ donationId: expect.any(String) });
    }));
});
