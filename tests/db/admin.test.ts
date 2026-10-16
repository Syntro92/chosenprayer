import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { AuthAdmin } from "@/server/auth/auth-admin";
import { getPool, type Queryable } from "@/server/db";
import { toAppError } from "@/server/errors";
import { createAdminChannel, getAdminChannel, listAdminChannels, setChannelStatus, updateAdminChannel } from "@/server/services/admin-channels";
import { getSettings, updateSettings } from "@/server/services/admin-config";
import { getAnalytics, getDashboard, getHealth, getLiveVisitors } from "@/server/services/admin-insights";
import { resolveReport } from "@/server/services/admin-reports";
import { getAdminTransaction, listAdminTransactions } from "@/server/services/admin-transactions";
import { updatePassword } from "@/server/services/accounts";
import { createAdminUser, getAdminUser, listAdminUsers, updateAdminUser } from "@/server/services/admin-users";
import { listAuditLog } from "@/server/services/audit";
import { adminRefund } from "@/server/services/giving";
import { listNotifications } from "@/server/services/notifications";
import { channel, FakeProvider, member } from "../helpers/fixtures";
import { withRollback } from "../helpers/rollback";

afterAll(async () => {
  await getPool().end();
});

/** Services throw raw zod errors for malformed input; the route/action layer turns them into VALIDATION. Do the same here. */
async function invalid(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return toAppError(e);
  }
  throw new Error("expected the call to be rejected");
}

class FakeAuth implements AuthAdmin {
  calls: [string, boolean][] = [];
  async setBanned(userId: string, banned: boolean) {
    this.calls.push([userId, banned]);
  }
}

const admin = (c: Queryable) => member(c, { role: "admin", name: "Ada Admin" });
const handleOf = () => `adm_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
const newChannel = (over: Record<string, unknown> = {}) => ({ handle: handleOf(), name: "Quiet Mornings", category: "faith", ...over });

async function donation(c: Queryable, channelId: string, over: { status?: string; cents?: number; donorId?: string | null; name?: string; email?: string; source?: string } = {}) {
  const { rows } = await c.query<{ id: string }>(
    `insert into public.donations (channel_id, donor_id, donor_name, donor_email, amount_cents, currency, status, source, provider, provider_payment_id, paid_at)
     values ($1, $2, $3, $4, $5, 'USD', $6::public.donation_status, $7::public.donation_source, 'mock', $8, case when $6 = 'succeeded' then now() end) returning id`,
    [channelId, over.donorId ?? null, over.name ?? "Guest Giver", over.email ?? "giver@example.com", over.cents ?? 2500, over.status ?? "succeeded", over.source ?? "web", `pi_${randomUUID()}`],
  );
  return rows[0].id;
}

describe("access control", () => {
  it("every admin service rejects anonymous and members", () =>
    withRollback(async (c) => {
      const m = await member(c);
      const calls: ((actor: typeof m | null) => Promise<unknown>)[] = [
        (a) => listAdminChannels(a, {}, c),
        (a) => createAdminChannel(a, newChannel(), c),
        (a) => listAdminTransactions(a, {}, c),
        (a) => listAdminUsers(a, {}, c),
        (a) => getSettings(a, c),
        (a) => getDashboard(a, c),
        (a) => getAnalytics(a, {}, c),
        (a) => getLiveVisitors(a, c),
        (a) => getHealth(a, { name: "mock", testMode: true }, c),
      ];
      for (const call of calls) {
        await expect(call(null)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
        await expect(call(m)).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
    }));

  it("a suspended admin is locked out", () =>
    withRollback(async (c) => {
      const a = await member(c, { role: "admin", status: "suspended" });
      await expect(listAdminChannels(a, {}, c)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }));
});

describe("admin channels", () => {
  it("creates a live channel, stamps published_at and audits it", () =>
    withRollback(async (c) => {
      const a = await admin(c);
      const input = newChannel({ description: "Short", about: ["One", "Two"], mission: "M", featured: true });
      const { channel: ch, handle } = await createAdminChannel(a, input, c);
      expect(handle).toBe(input.handle);
      expect(ch).toMatchObject({ name: "Quiet Mornings", status: "active", featured: true, about: ["One", "Two"], category: "Faith", raisedCents: 0 });
      expect(ch.publishedAt).not.toBeNull();
      const log = await listAuditLog(a, { entityType: "channel" }, c);
      expect(log.items[0]).toMatchObject({ action: "channel.create", entityId: ch.id });
    }));

  it("can create a pending channel for an owner (not yet published)", () =>
    withRollback(async (c) => {
      const a = await admin(c);
      const owner = await member(c);
      const { channel: ch } = await createAdminChannel(a, newChannel({ status: "pending", ownerUsername: owner.username }), c);
      expect(ch.status).toBe("pending");
      expect(ch.publishedAt).toBeNull();
      expect(ch.owner).toMatchObject({ id: owner.userId, username: owner.username });
    }));

  it("rejects bad input: taken handle, unknown category, unknown owner, malformed handle", () =>
    withRollback(async (c) => {
      const a = await admin(c);
      const input = newChannel();
      await createAdminChannel(a, input, c);
      await expect(createAdminChannel(a, { ...input, name: "Again" }, c)).rejects.toMatchObject({ code: "CONFLICT", fields: { handle: expect.any(String) } });
      expect(await invalid(createAdminChannel(a, newChannel({ category: "nope" }), c))).toMatchObject({ code: "VALIDATION" });
      expect(await invalid(createAdminChannel(a, newChannel({ ownerUsername: "no_such_person_x" }), c))).toMatchObject({ code: "VALIDATION" });
      expect(await invalid(createAdminChannel(a, newChannel({ handle: "x" }), c))).toMatchObject({ code: "VALIDATION" });
      expect(await invalid(createAdminChannel(a, newChannel({ name: "  " }), c))).toMatchObject({ code: "VALIDATION" });
    }));

  it("lists with search and status filter; pending channels come first", () =>
    withRollback(async (c) => {
      const a = await admin(c);
      const tag = `zq${randomUUID().replace(/-/g, "").slice(0, 8)}`;
      await createAdminChannel(a, newChannel({ name: `${tag} live` }), c);
      await createAdminChannel(a, newChannel({ name: `${tag} waiting`, status: "pending" }), c);
      const all = await listAdminChannels(a, { q: tag }, c);
      expect(all.total).toBe(2);
      expect(all.items.map((i) => i.status)).toEqual(["pending", "active"]);
      expect((await listAdminChannels(a, { q: tag, status: "active" }, c)).items).toHaveLength(1);
      expect((await listAdminChannels(a, { q: tag, page: 2, pageSize: 1 }, c)).items).toHaveLength(1);
      // wildcard characters in the search are literal
      expect((await listAdminChannels(a, { q: "%" }, c)).items.every((i) => i.name.includes("%") || i.handle.includes("%"))).toBe(true);
    }));

  it("the 'show blessings' switch defaults on, can be created off, and is edited and audited like any field", () =>
    withRollback(async (c) => {
      const a = await admin(c);
      const { channel: on } = await createAdminChannel(a, newChannel(), c);
      expect(on.showBlessings).toBe(true);
      const { channel: off } = await createAdminChannel(a, newChannel({ showBlessings: false }), c);
      expect(off.showBlessings).toBe(false);

      const out = await updateAdminChannel(a, on.id, { showBlessings: false }, c);
      expect(out.channel.showBlessings).toBe(false);
      expect((await getAdminChannel(a, on.id, c)).showBlessings).toBe(false);
      expect((await c.query("select show_blessings from public.channels where id = $1", [on.id])).rows[0].show_blessings).toBe(false);
      const log = await listAuditLog(a, { entityType: "channel" }, c);
      expect(log.items.some((i) => i.action === "channel.update" && (i.metadata.fields as string[]).includes("showBlessings"))).toBe(true);

      expect((await updateAdminChannel(a, on.id, { showBlessings: true }, c)).channel.showBlessings).toBe(true);
      expect(await invalid(updateAdminChannel(a, on.id, { showBlessings: "yes" }, c))).toMatchObject({ code: "VALIDATION" });
    }));

  it("edits fields, never the handle, and audits which fields changed", () =>
    withRollback(async (c) => {
      const a = await admin(c);
      const { channel: ch } = await createAdminChannel(a, newChannel(), c);
      const out = await updateAdminChannel(a, ch.id, { name: "Renamed", verified: true, about: ["New"], handle: "ignored_value" }, c);
      expect(out.channel).toMatchObject({ name: "Renamed", verified: true, about: ["New"], handle: ch.handle });
      const log = await listAuditLog(a, { entityType: "channel" }, c);
      expect(log.items[0]).toMatchObject({ action: "channel.update", metadata: { fields: expect.arrayContaining(["name", "verified", "about"]) } });
      expect(await invalid(updateAdminChannel(a, ch.id, {}, c))).toMatchObject({ code: "VALIDATION" });
      expect(await invalid(updateAdminChannel(a, ch.id, { category: "nope" }, c))).toMatchObject({ code: "VALIDATION" });
      await expect(updateAdminChannel(a, randomUUID(), { name: "x" }, c)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(getAdminChannel(a, "not-a-uuid", c)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }));

  it("approving a pending channel publishes it and tells the owner; pausing is also announced", () =>
    withRollback(async (c) => {
      const a = await admin(c);
      const owner = await member(c);
      const { channel: ch } = await createAdminChannel(a, newChannel({ status: "pending", ownerUsername: owner.username, name: "Hopeful" }), c);

      const approved = await setChannelStatus(a, ch.id, { status: "active" }, c);
      expect(approved.channel.status).toBe("active");
      expect(approved.channel.publishedAt).not.toBeNull();
      const first = approved.channel.publishedAt;
      let inbox = await listNotifications(owner, {}, c);
      expect(inbox.items[0].text).toMatch(/approved and is now live/);

      await setChannelStatus(a, ch.id, { status: "paused", note: "Policy review." }, c);
      inbox = await listNotifications(owner, {}, c);
      expect(inbox.items.map((i) => i.text).join(" | ")).toMatch(/paused\. Policy review\./); // same-transaction timestamps tie, so don't rely on order

      const again = await setChannelStatus(a, ch.id, { status: "active" }, c);
      expect(again.channel.publishedAt).toBe(first); // first publish time is kept
      const log = await listAuditLog(a, { entityType: "channel" }, c);
      expect(log.items.map((i) => i.metadata.to)).toEqual(expect.arrayContaining(["active", "paused"]));
    }));

  it("refuses no-op and backwards transitions", () =>
    withRollback(async (c) => {
      const a = await admin(c);
      const { channel: ch } = await createAdminChannel(a, newChannel(), c);
      await expect(setChannelStatus(a, ch.id, { status: "active" }, c)).rejects.toMatchObject({ code: "CONFLICT" });
      expect(await invalid(setChannelStatus(a, ch.id, { status: "pending" }, c))).toMatchObject({ code: "VALIDATION" });
      expect(await invalid(setChannelStatus(a, ch.id, { status: "bogus" }, c))).toMatchObject({ code: "VALIDATION" });
      await expect(setChannelStatus(a, randomUUID(), { status: "paused" }, c)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }));
});

describe("admin transactions", () => {
  it("lists with filters and shows the donor, guest or member", () =>
    withRollback(async (c) => {
      const a = await admin(c);
      const donor = await member(c, { name: "Maria Member" });
      const ch = await channel(c, { name: "Filter Channel" });
      const ok = await donation(c, ch.id, { donorId: donor.userId, cents: 5000, source: "email", email: "maria@example.com" });
      const failed = await donation(c, ch.id, { status: "failed", name: "Fay Failed" });
      await donation(c, ch.id, { status: "refunded", name: "Rex Refunded" });

      const mine = await listAdminTransactions(a, { channel: ch.handle }, c);
      expect(mine.total).toBe(3);
      const row = mine.items.find((i) => i.id === ok)!;
      expect(row).toMatchObject({ amountCents: 5000, status: "succeeded", source: "email", donor: { name: "Maria Member", userId: donor.userId, guest: false } });
      expect(mine.items.find((i) => i.id === failed)!.donor).toMatchObject({ name: "Fay Failed", guest: true });

      expect((await listAdminTransactions(a, { channel: ch.handle, status: "failed" }, c)).items.map((i) => i.id)).toEqual([failed]);
      expect((await listAdminTransactions(a, { channel: ch.handle, source: "email" }, c)).total).toBe(1);
      expect((await listAdminTransactions(a, { channel: ch.handle, q: "maria" }, c)).items.map((i) => i.id)).toEqual([ok]);
      expect((await listAdminTransactions(a, { q: ok }, c)).items.map((i) => i.id)).toEqual([ok]);
      const today = new Date().toISOString().slice(0, 10);
      expect((await listAdminTransactions(a, { channel: ch.handle, from: today, to: today }, c)).total).toBe(3);
      expect((await listAdminTransactions(a, { channel: ch.handle, from: "2000-01-01", to: "2000-01-02" }, c)).total).toBe(0);
      expect(await invalid(listAdminTransactions(a, { from: "13/10/2026" }, c))).toMatchObject({ code: "VALIDATION" });
    }));

  it("detail includes provider ids and the blessing; refunding records who and why", () =>
    withRollback(async (c) => {
      const a = await admin(c);
      const ch = await channel(c);
      const id = await donation(c, ch.id, { cents: 1200 });
      await c.query("insert into public.blessings (donation_id, channel_id, display_name, message) values ($1, $2, 'Sam', 'Peace be with you')", [id, ch.id]);

      await c.query("update public.donations set receipt_url = 'https://pay.stripe.com/receipts/payment/abc' where id = $1", [id]);
      const before = await getAdminTransaction(a, id, c);
      expect(before.receiptUrl).toBe("https://pay.stripe.com/receipts/payment/abc");
      expect(before).toMatchObject({ status: "succeeded", provider: "mock", blessing: { message: "Peace be with you", displayName: "Sam" }, refund: null });
      expect(before.providerPaymentId).toMatch(/^pi_/);

      const provider = new FakeProvider();
      await adminRefund(a, id, { reason: "Duplicate gift" }, c, provider);
      expect(provider.refunded).toEqual([before.providerPaymentId]);
      const after = await getAdminTransaction(a, id, c);
      expect(after).toMatchObject({ status: "refunded", refund: { reason: "Duplicate gift", by: "Ada Admin" } });
      expect(after.refundedAt).not.toBeNull();
      await expect(getAdminTransaction(a, randomUUID(), c)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(getAdminTransaction(a, "nope", c)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }));
});

describe("admin users", () => {
  it("lists with email, search and filters, and shows detail stats", () =>
    withRollback(async (c) => {
      const a = await admin(c);
      const u = await member(c, { name: "Searchable Sam" });
      const { rows } = await c.query<{ email: string }>("select email from auth.users where id = $1", [u.userId]);

      const found = await listAdminUsers(a, { q: u.username }, c);
      expect(found.items).toHaveLength(1);
      expect(found.items[0]).toMatchObject({ id: u.userId, email: rows[0].email, role: "member", status: "active", name: "Searchable Sam" });
      expect((await listAdminUsers(a, { q: rows[0].email }, c)).items.map((i) => i.id)).toEqual([u.userId]);
      expect((await listAdminUsers(a, { q: u.userId }, c)).items.map((i) => i.id)).toEqual([u.userId]);
      expect((await listAdminUsers(a, { role: "admin" }, c)).items.some((i) => i.id === a.userId)).toBe(true);
      expect((await listAdminUsers(a, { q: u.username, status: "suspended" }, c)).total).toBe(0);

      const ch = await channel(c);
      await donation(c, ch.id, { donorId: u.userId, cents: 700 });
      await c.query("insert into public.posts (author_id, body) values ($1, 'hi')", [u.userId]);
      const detail = await getAdminUser(a, u.userId, c);
      expect(detail.stats).toMatchObject({ posts: 1, comments: 0, donations: 1, givenCents: 700, reportsAgainst: 0 });
      await expect(getAdminUser(a, randomUUID(), c)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }));

  it("changes role, suspends (with a ban), unsuspends and verifies, all audited in the user's history", () =>
    withRollback(async (c) => {
      const a = await admin(c);
      const u = await member(c);
      const auth = new FakeAuth();

      let out = await updateAdminUser(a, u.userId, { role: "admin", verified: true }, c, auth);
      expect(out).toMatchObject({ role: "admin", verified: true });

      expect(await invalid(updateAdminUser(a, u.userId, { status: "suspended" }, c, auth))).toMatchObject({ code: "VALIDATION", fields: { reason: expect.any(String) } });
      out = await updateAdminUser(a, u.userId, { status: "suspended", reason: "Abuse" }, c, auth);
      expect(out.status).toBe("suspended");
      expect(auth.calls).toEqual([[u.userId, true]]);

      out = await updateAdminUser(a, u.userId, { status: "active" }, c, auth);
      expect(out.status).toBe("active");
      expect(auth.calls[1]).toEqual([u.userId, false]);

      expect(out.history.map((h) => h.action)).toEqual(expect.arrayContaining(["user.set_role", "user.verify", "user.suspend", "user.unsuspend"]));
      expect(out.history[0].by).toBe("Ada Admin");
    }));

  it("keeps the safety rules: no self role change, can't suspend an admin or yourself, no empty patch", () =>
    withRollback(async (c) => {
      const a = await admin(c);
      const other = await member(c, { role: "admin" });
      const auth = new FakeAuth();
      expect(await invalid(updateAdminUser(a, a.userId, { role: "member" }, c, auth))).toMatchObject({ code: "VALIDATION" });
      await expect(updateAdminUser(a, other.userId, { status: "suspended", reason: "x" }, c, auth)).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await invalid(updateAdminUser(a, a.userId, { status: "suspended", reason: "x" }, c, auth))).toMatchObject({ code: "VALIDATION" });
      expect(await invalid(updateAdminUser(a, other.userId, {}, c, auth))).toMatchObject({ code: "VALIDATION" });
      expect(await invalid(updateAdminUser(a, other.userId, { role: "superuser" }, c, auth))).toMatchObject({ code: "VALIDATION" });
      await expect(updateAdminUser(a, randomUUID(), { verified: true }, c, auth)).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(auth.calls).toEqual([]);
    }));
});

describe("admin create user", () => {
  /** Stand-in for Supabase Auth: inserts the auth.users row (the trigger makes the profile) inside the test transaction. */
  const provisioner = (c: Queryable) => ({
    async createUser({ email, fullName }: { email: string; password: string; fullName: string }) {
      const id = randomUUID();
      await c.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [id, email, JSON.stringify({ full_name: fullName })]);
      return { id };
    },
  });
  const input = (over: Record<string, unknown> = {}) => ({
    fullName: "New Person",
    email: `new_${randomUUID().slice(0, 8)}@example.com`,
    password: "correct horse battery",
    ...over,
  });

  it("creates an admin, audits it, and defaults to member", () =>
    withRollback(async (c) => {
      const a = await admin(c);
      const created = await createAdminUser(a, input({ role: "admin" }), c, provisioner(c));
      expect(created).toMatchObject({ name: "New Person", role: "admin", status: "active" });
      expect(created.history[0]).toMatchObject({ action: "user.create", by: "Ada Admin" });

      const plain = await createAdminUser(a, input(), c, provisioner(c));
      expect(plain.role).toBe("member");
    }));

  it("flags the new account for a forced password change, cleared once they pick their own", () =>
    withRollback(async (c) => {
      const a = await admin(c);
      const created = await createAdminUser(a, input({ role: "admin" }), c, provisioner(c));
      const flag = async () => (await c.query("select must_change_password as f from public.profiles where id = $1", [created.id])).rows[0].f;
      expect(await flag()).toBe(true);
      // Ordinary members and staff are unaffected.
      expect((await c.query("select must_change_password as f from public.profiles where id = $1", [a.userId])).rows[0].f).toBe(false);

      const actor = { ...a, userId: created.id, role: "admin" as const, mustChangePassword: true };
      const supabase = { auth: { updateUser: async () => ({ error: null }) } } as never;
      await updatePassword({ supabase, ip: "127.0.0.1" }, actor, { password: "a brand new password" }, c);
      expect(await flag()).toBe(false);
    }));

  it("a failed password change keeps the flag", () =>
    withRollback(async (c) => {
      const a = await admin(c);
      const created = await createAdminUser(a, input(), c, provisioner(c));
      const actor = { ...a, userId: created.id, mustChangePassword: true };
      const supabase = { auth: { updateUser: async () => ({ error: { code: "weak_password", message: "weak" } }) } } as never;
      await expect(updatePassword({ supabase, ip: "127.0.0.1" }, actor, { password: "a brand new password" }, c)).rejects.toMatchObject({ code: "VALIDATION" });
      expect((await c.query("select must_change_password as f from public.profiles where id = $1", [created.id])).rows[0].f).toBe(true);
    }));

  it("is admin-only and validates input", () =>
    withRollback(async (c) => {
      const m = await member(c);
      const a = await admin(c);
      await expect(createAdminUser(null, input(), c, provisioner(c))).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      await expect(createAdminUser(m, input(), c, provisioner(c))).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect((await invalid(createAdminUser(a, input({ password: "short" }), c, provisioner(c)))).code).toBe("VALIDATION");
      expect((await invalid(createAdminUser(a, input({ email: "nope" }), c, provisioner(c)))).code).toBe("VALIDATION");
      expect((await invalid(createAdminUser(a, input({ role: "owner" }), c, provisioner(c)))).code).toBe("VALIDATION");
    }));
});

describe("settings", () => {
  it("reads and updates the single settings row, validating input and auditing changes", () =>
    withRollback(async (c) => {
      const a = await admin(c);
      const before = await getSettings(a, c);
      const out = await updateSettings(a, { siteName: "Chosen Prayer QA", contactEmail: "help@example.com", defaultCurrency: "aud", notifyOnDonation: !before.notifyOnDonation }, c);
      expect(out).toMatchObject({ siteName: "Chosen Prayer QA", contactEmail: "help@example.com", defaultCurrency: "AUD", notifyOnDonation: !before.notifyOnDonation });
      const log = await listAuditLog(a, { entityType: "setting" }, c);
      expect(log.items[0].metadata.fields).toEqual(expect.arrayContaining(["siteName", "contactEmail", "defaultCurrency", "notifyOnDonation"]));

      const cleared = await updateSettings(a, { siteName: "Chosen Prayer QA", contactEmail: "", defaultCurrency: "AUD", notifyOnDonation: out.notifyOnDonation }, c);
      expect(cleared.contactEmail).toBeNull();

      expect(await invalid(updateSettings(a, { siteName: "", contactEmail: "", defaultCurrency: "USD", notifyOnDonation: true }, c))).toMatchObject({ code: "VALIDATION" });
      expect(await invalid(updateSettings(a, { siteName: "x", contactEmail: "not-an-email", defaultCurrency: "USD", notifyOnDonation: true }, c))).toMatchObject({ code: "VALIDATION" });
      expect(await invalid(updateSettings(a, { siteName: "x", contactEmail: "", defaultCurrency: "DOLLARS", notifyOnDonation: true }, c))).toMatchObject({ code: "VALIDATION" });
    }));

  it("sets the landing-page cover, keeps it when omitted, and rejects keys that are not hero uploads", () =>
    withRollback(async (c) => {
      const a = await admin(c);
      const base = { siteName: "Chosen Prayer QA", contactEmail: "", defaultCurrency: "USD", notifyOnDonation: true };
      const key = `hero/${randomUUID()}.webp`;
      const set = await updateSettings(a, { ...base, heroImagePath: key }, c);
      expect(set.heroImagePath).toBe(key);
      expect(set.heroImageUrl).toContain(`/channel-images/${key}`);
      expect((await listAuditLog(a, { entityType: "setting" }, c)).items[0].metadata.fields).toContain("heroImagePath");
      // saving the form without the field leaves the cover alone
      expect((await updateSettings(a, base, c)).heroImagePath).toBe(key);
      for (const bad of [`channels/${randomUUID()}.webp`, "hero/../x.png", "https://evil.example/x.png"]) {
        expect(await invalid(updateSettings(a, { ...base, heroImagePath: bad }, c))).toMatchObject({ code: "VALIDATION" });
      }
    }));
});

describe("dashboard, analytics, live and health", () => {
  it("dashboard totals count succeeded gifts only and the series covers 30 days", () =>
    withRollback(async (c) => {
      const a = await admin(c);
      const before = await getDashboard(a, c);
      const ch = await channel(c, { name: "Dash Channel" });
      await donation(c, ch.id, { cents: 10_000, email: "one@example.com" });
      await donation(c, ch.id, { cents: 5_000, email: "one@example.com" }); // same donor
      await donation(c, ch.id, { cents: 3_000, email: "two@example.com" });
      await donation(c, ch.id, { cents: 9_999, status: "failed" });
      await donation(c, ch.id, { cents: 4_000, status: "refunded" });

      const after = await getDashboard(a, c);
      expect(after.totals.raisedCents - before.totals.raisedCents).toBe(18_000);
      expect(after.totals.donations - before.totals.donations).toBe(3);
      expect(after.totals.donors - before.totals.donors).toBe(2);
      expect(after.totals.refundedCents - before.totals.refundedCents).toBe(4_000);
      expect(after.totals.averageCents).toBe(Math.round(after.totals.raisedCents / after.totals.donations));
      expect(after.series).toHaveLength(30);
      const today = after.series.at(-1)!;
      expect(today.amountCents).toBeGreaterThanOrEqual(18_000);
      expect(after.topChannels.some((t) => t.handle === ch.handle)).toBe(true);
      expect(after.recentTransactions.length).toBeLessThanOrEqual(8);
      expect(after.recentTransactions[0]).toMatchObject({ channel: { handle: ch.handle } });
      expect(typeof after.openReports).toBe("number");
      // month-to-date includes today's gifts; the once/monthly split sums to the (all-time) kept total
      expect(after.month.raisedCents - before.month.raisedCents).toBe(18_000);
      expect(after.breakdown.onceCents + after.breakdown.monthlyCents).toBe(after.totals.raisedCents);
      expect(after.activity.length).toBeGreaterThan(0);
      expect(after.activity.length).toBeLessThanOrEqual(8);
      expect(after.activity.some((x) => x.kind === "support" && x.channel === "Dash Channel")).toBe(true);
    }));

  it("analytics aggregates page views (bots excluded) over the chosen range", () =>
    withRollback(async (c) => {
      const a = await admin(c);
      const base = await getAnalytics(a, { range: "7d" }, c);
      const v1 = randomUUID();
      const v2 = randomUUID();
      const view = (visitor: string, path: string, device: string, ago = "0 minutes") =>
        c.query("insert into public.page_views (visitor_id, path, referrer, country, device, created_at) values ($1, $2, 'https://example.org/', 'AU', $3, now() - $4::interval)", [visitor, path, device, ago]);
      await view(v1, "/zz-test", "mobile");
      await view(v1, "/zz-test", "mobile");
      await view(v2, "/zz-test", "desktop");
      await view(randomUUID(), "/zz-test", "bot");
      await view(v2, "/zz-old", "desktop", "40 days"); // outside 7d

      const out = await getAnalytics(a, { range: "7d" }, c);
      expect(out.days).toBe(7);
      expect(out.traffic.views - base.traffic.views).toBe(3);
      expect(out.traffic.visitors - base.traffic.visitors).toBe(2);
      expect(out.traffic.viewsSeries).toHaveLength(7);
      expect(out.topPages.find((p) => p.path === "/zz-test")!.views - (base.topPages.find((p) => p.path === "/zz-test")?.views ?? 0)).toBe(3);
      expect(out.topPages.some((p) => p.path === "/zz-old")).toBe(false);
      expect(out.devices.map((d) => d.device)).not.toContain("bot");
      expect((await getAnalytics(a, {}, c)).range).toBe("30d");
      await expect(getAnalytics(a, { range: "1y" }, c)).rejects.toThrow();
    }));

  it("live visitors counts distinct visitors seen in the last 5 minutes", () =>
    withRollback(async (c) => {
      const a = await admin(c);
      const base = await getLiveVisitors(a, c);
      const v1 = randomUUID();
      const insert = (visitor: string, ago: string, path = "/zz-live", device = "desktop") =>
        c.query("insert into public.page_views (visitor_id, path, country, device, created_at) values ($1, $2, 'IN', $3, now() - $4::interval)", [visitor, path, device, ago]);
      await insert(v1, "2 minutes", "/zz-a");
      await insert(v1, "1 minute", "/zz-live");
      await insert(randomUUID(), "30 seconds");
      await insert(randomUUID(), "10 minutes"); // gone
      await insert(randomUUID(), "30 seconds", "/zz-live", "bot"); // ignored

      const out = await getLiveVisitors(a, c);
      expect(out.windowMinutes).toBe(5);
      expect(out.online - base.online).toBe(2);
      const mine = out.visitors.find((v) => v.visitor === v1.slice(0, 8))!;
      expect(mine).toMatchObject({ path: "/zz-live", country: "IN", pages: 2 });
      expect(out.topPaths.find((p) => p.path === "/zz-live")!.visitors).toBeGreaterThanOrEqual(2);
      expect(JSON.stringify(out)).not.toContain(v1); // full visitor ids are never exposed
      expect(out.hourly).toHaveLength(24);
      expect(out.hourly.at(-1)! - base.hourly.at(-1)!).toBeGreaterThanOrEqual(2);
    }));

  it("health reports the database, payment test mode, email backlog and cron freshness", () =>
    withRollback(async (c) => {
      const a = await admin(c);
      await c.query("delete from public.cron_runs where job in ('email', 'sweep')");
      await c.query("insert into public.cron_runs (job, last_ok, detail) values ('email', true, 'sent 0')");
      const h = await getHealth(a, { name: "mock", testMode: true }, c);
      expect(h.checks.database.ok).toBe(true);
      expect(h.checks.payments).toMatchObject({ provider: "mock", testMode: true });
      expect(h.checks.email).toMatchObject({ pending: expect.any(Number), failed: expect.any(Number) });
      const email = h.cron.find((j) => j.job === "email")!;
      expect(email).toMatchObject({ ok: true, stale: false });
      expect(h.cron.find((j) => j.job === "sweep")).toMatchObject({ stale: true, detail: "Never run" });
    }));

  it("health flags failed emails as unhealthy", () =>
    withRollback(async (c) => {
      const a = await admin(c);
      await c.query("insert into public.email_outbox (to_email, template, payload, status, attempts) values ('x@example.com', 'donation_refunded', '{}', 'failed', 5)");
      const h = await getHealth(a, { name: "mock", testMode: true }, c);
      expect(h.checks.email.failed).toBeGreaterThanOrEqual(1);
      expect(h.checks.email.ok).toBe(false);
      expect(h.ok).toBe(false);
    }));
});

describe("resolveReport", () => {
  async function reported(c: Queryable) {
    const author = await member(c);
    const reporter = await member(c);
    const { rows: [post] } = await c.query<{ id: string }>("insert into public.posts (author_id, body) values ($1, 'questionable') returning id", [author.userId]);
    const { rows: [rep] } = await c.query<{ id: string }>("insert into public.reports (reporter_id, post_id, reason) values ($1, $2, 'spam') returning id", [reporter.userId, post.id]);
    return { postId: post.id, reportId: rep.id };
  }

  it("an admin can dismiss or remove; removal needs a reason", () =>
    withRollback(async (c) => {
      const mod = await member(c, { role: "admin" });
      const one = await reported(c);
      expect(await resolveReport(mod, one.reportId, { action: "dismiss", note: "Looks fine" }, c)).toEqual({ action: "dismiss" });
      expect((await c.query("select status, resolution from public.reports where id = $1", [one.reportId])).rows[0]).toMatchObject({ status: "dismissed", resolution: "Looks fine" });

      const two = await reported(c);
      expect(await invalid(resolveReport(mod, two.reportId, { action: "remove" }, c))).toMatchObject({ code: "VALIDATION" });
      await resolveReport(mod, two.reportId, { action: "remove", reason: "Spam" }, c);
      expect((await c.query("select status from public.posts where id = $1", [two.postId])).rows[0].status).toBe("removed");
      expect((await c.query("select status from public.reports where id = $1", [two.reportId])).rows[0].status).toBe("actioned");
    }));

  it("rejects members, unknown reports and unknown actions", () =>
    withRollback(async (c) => {
      const m = await member(c);
      const mod = await member(c, { role: "admin" });
      const r = await reported(c);
      await expect(resolveReport(m, r.reportId, { action: "dismiss" }, c)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(resolveReport(null, r.reportId, { action: "dismiss" }, c)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      await expect(resolveReport(mod, randomUUID(), { action: "dismiss" }, c)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(resolveReport(mod, r.reportId, { action: "ban" }, c)).rejects.toThrow();
    }));
});
