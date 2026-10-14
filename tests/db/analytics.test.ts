import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getPool } from "@/server/db";
import { recordPageView } from "@/server/services/analytics";
import { getAnalytics, getLiveVisitors } from "@/server/services/admin-insights";
import { RETENTION, runCleanup } from "@/server/services/cleanup";
import { channel, FakeStorage, member, putObject } from "../helpers/fixtures";
import { withRollback } from "../helpers/rollback";

afterAll(async () => {
  await getPool().end();
});

const view = (over: Partial<Parameters<typeof recordPageView>[0]> = {}) => ({
  visitorId: randomUUID(),
  path: "/zz-m7",
  referrer: null,
  country: "AU",
  device: "desktop" as const,
  ...over,
});

describe("recordPageView", () => {
  it("stores the view and links a channel page to its channel", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const v = view({ path: `/channels/${ch.handle}`, referrer: "https://t.co" });
      await recordPageView(v, c);
      const r = (await c.query("select visitor_id, channel_id, path, referrer, country, device, user_id from public.page_views where visitor_id = $1", [v.visitorId])).rows[0];
      expect(r).toMatchObject({ channel_id: ch.id, path: v.path, referrer: "https://t.co", country: "AU", device: "desktop", user_id: null });
    }));

  it("an unknown channel handle or a normal page has no channel", () =>
    withRollback(async (c) => {
      const a = view({ path: "/channels/doesnotexist1" });
      const b = view({ path: "/about", country: null });
      await recordPageView(a, c);
      await recordPageView(b, c);
      const rows = (await c.query("select visitor_id, channel_id, country from public.page_views where visitor_id = any($1)", [[a.visitorId, b.visitorId]])).rows;
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.channel_id === null)).toBe(true);
      expect(rows.find((r) => r.visitor_id === b.visitorId)!.country).toBeNull();
    }));

  it("feeds the admin analytics and live visitor numbers", () =>
    withRollback(async (c) => {
      const admin = await member(c, { role: "admin" });
      const before = await getAnalytics(admin, { range: "7d" }, c);
      const liveBefore = await getLiveVisitors(admin, c);
      const v = randomUUID();
      await recordPageView(view({ visitorId: v }), c);
      await recordPageView(view({ visitorId: v }), c);
      await recordPageView(view({ device: "bot" }), c);
      const after = await getAnalytics(admin, { range: "7d" }, c);
      expect(after.traffic.views - before.traffic.views).toBe(2); // bot excluded
      expect(after.traffic.visitors - before.traffic.visitors).toBe(1);
      expect((await getLiveVisitors(admin, c)).online - liveBefore.online).toBe(1);
    }));
});

describe("runCleanup", () => {
  it("deletes old page views, expired counters and old sent emails, and keeps recent/unsent ones", () =>
    withRollback(async (c) => {
      const old = randomUUID();
      const fresh = randomUUID();
      await c.query("insert into public.page_views (visitor_id, path, created_at) values ($1, '/zz-old', now() - make_interval(days => $2)), ($3, '/zz-new', now())", [old, RETENTION.pageViewDays + 1, fresh]);
      await c.query("insert into public.rate_limits (key, window_start, count) values ('zz:old', now() - interval '3 days', 1), ('zz:new', now(), 1)");
      await c.query(
        `insert into public.email_outbox (to_email, template, payload, status, sent_at) values
           ('old-sent@example.com', 'donation_refunded', '{}', 'sent', now() - make_interval(days => $1)),
           ('new-sent@example.com', 'donation_refunded', '{}', 'sent', now()),
           ('old-failed@example.com', 'donation_refunded', '{}', 'failed', null)`,
        [RETENTION.sentEmailDays + 1],
      );

      const r = await runCleanup(c, new FakeStorage());
      expect(r.pageViews).toBeGreaterThanOrEqual(1);
      expect(r.rateLimits).toBeGreaterThanOrEqual(1);
      expect(r.sentEmails).toBeGreaterThanOrEqual(1);

      const left = (await c.query("select path from public.page_views where visitor_id = any($1)", [[old, fresh]])).rows.map((x) => x.path);
      expect(left).toEqual(["/zz-new"]);
      expect((await c.query("select key from public.rate_limits where key like 'zz:%'")).rows.map((x) => x.key)).toEqual(["zz:new"]);
      const mails = (await c.query("select to_email::text as e from public.email_outbox where to_email::text in ('old-sent@example.com','new-sent@example.com','old-failed@example.com') order by 1")).rows.map((x) => x.e);
      expect(mails).toEqual(["new-sent@example.com", "old-failed@example.com"]); // failed mail is kept for investigation
    }));

  it("removes uploads nobody attached after 24h, keeps attached, recent and other buckets' files", () =>
    withRollback(async (c) => {
      const author = await member(c);
      const mk = (name: string) => `posts/${author.userId}/${name}.png`;
      const [orphan, recent, attached] = [mk("orphan"), mk("recent"), mk("attached")];
      for (const k of [orphan, recent, attached]) await putObject(c, k, 100, "image/png");
      await c.query("update storage.objects set created_at = now() - interval '2 days' where name = any($1)", [[orphan, attached]]);
      const { rows: [p] } = await c.query<{ id: string }>("insert into public.posts (author_id, body) values ($1, 'x') returning id", [author.userId]);
      await c.query("insert into public.post_attachments (post_id, kind, name, size_bytes, mime, storage_path) values ($1, 'image', 'a.png', 100, 'image/png', $2)", [p.id, attached]);

      const storage = new FakeStorage();
      const r = await runCleanup(c, storage);
      expect(storage.removed).toContain(orphan);
      expect(storage.removed).not.toContain(recent);
      expect(storage.removed).not.toContain(attached);
      expect(r.orphanUploads).toBe(storage.removed.length);
    }));
});
