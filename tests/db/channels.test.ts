import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { Actor } from "@/server/auth/policy";
import { getPool, type Queryable } from "@/server/db";
import { RATE_LIMITS, hit } from "@/server/rate-limit";
import { getChannelProfile, getFeaturedChannel, listCategories, listChannels } from "@/server/services/channels";
import { followChannel, isFollowing, listMyFollowing, unfollowChannel } from "@/server/services/follows";
import { withRollback } from "../helpers/rollback";

afterAll(async () => {
  await getPool().end();
});

/* ---- helpers: everything runs inside a transaction that is rolled back ---- */

let seq = 0;
async function channel(
  c: Queryable,
  token: string,
  over: Partial<{
    name: string;
    handle: string;
    category: string;
    status: string;
    followers: number;
    featured: boolean;
    createdAt: string;
    description: string;
  }> = {},
) {
  const n = ++seq;
  const handle = over.handle ?? `${token}_c${n}`;
  const { rows } = await c.query<{ id: string }>(
    `insert into public.channels (handle, name, description, category, status, follower_count, featured, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [
      handle,
      over.name ?? `${token} Channel ${n}`,
      over.description ?? "A test channel",
      over.category ?? "faith",
      over.status ?? "active",
      over.followers ?? 0,
      over.featured ?? false,
      over.createdAt ?? new Date(Date.UTC(2025, 0, n)).toISOString(),
    ],
  );
  return { id: rows[0].id, handle };
}

async function member(c: Queryable, status: "active" | "suspended" = "active"): Promise<Actor> {
  const id = randomUUID();
  await c.query("insert into auth.users (id, email) values ($1, $2)", [id, `t${id.slice(0, 8)}@example.com`]);
  if (status === "suspended") await c.query("update public.profiles set status = 'suspended' where id = $1", [id]);
  const { rows } = await c.query<{ username: string; display_name: string }>(
    "select username, display_name from public.profiles where id = $1",
    [id],
  );
  return { userId: id, username: rows[0].username, displayName: rows[0].display_name, role: "member", status };
}

const token = () => `zz${randomUUID().slice(0, 8)}`;

/* ------------------------------------------------------------------------ */

describe("listCategories", () => {
  it("returns the 8 seeded categories in order", () =>
    withRollback(async (c) => {
      const cats = await listCategories(c);
      expect(cats.map((x) => x.slug)).toEqual([
        "inspiration", "education", "faith", "community", "creativity", "wellness", "music", "other",
      ]);
      expect(cats[0]).toEqual({ slug: "inspiration", name: "Inspiration" });
    }));
});

describe("listChannels", () => {
  it("shows only active channels", () =>
    withRollback(async (c) => {
      const t = token();
      await channel(c, t, { status: "active" });
      for (const status of ["pending", "paused", "archived"]) await channel(c, t, { status });
      const page = await listChannels({ q: t }, c);
      expect(page.items).toHaveLength(1);
    }));

  it("returns the shape the UI uses", () =>
    withRollback(async (c) => {
      const t = token();
      await c.query(
        `insert into public.channels (handle, name, description, category, status, follower_count, supporter_count, featured, verified, cover_tone, cover_scene)
         values ($1, $2, 'Desc', 'music', 'active', 1234, 56, true, true, 'sage', 'waves')`,
        [`${t}_x`, `${t} Name`],
      );
      const [ch] = (await listChannels({ q: t }, c)).items;
      expect(ch).toMatchObject({
        handle: `${t}_x`,
        name: `${t} Name`,
        description: "Desc",
        category: "Music",
        categorySlug: "music",
        followers: 1234,
        supporters: 56,
        cover: { tone: "sage", scene: "waves" },
        featured: true,
        verified: true,
      });
      expect(new Date(ch.createdAt).toString()).not.toBe("Invalid Date");
    }));

  describe("sorting + pagination", () => {
    async function seed(c: Queryable) {
      const t = token();
      // names deliberately out of order vs followers/dates; two channels tie on followers
      await channel(c, t, { name: `${t} Delta`, followers: 500, createdAt: "2025-03-01T00:00:00Z" });
      await channel(c, t, { name: `${t} alpha`, followers: 9000, createdAt: "2025-01-01T00:00:00Z" });
      await channel(c, t, { name: `${t} Charlie`, followers: 500, createdAt: "2025-05-01T00:00:00Z" });
      await channel(c, t, { name: `${t} Bravo`, followers: 12000, createdAt: "2025-02-01T00:00:00Z" });
      await channel(c, t, { name: `${t} Echo`, followers: 100, createdAt: "2025-04-01T00:00:00Z" });
      return t;
    }
    const suffix = (n: string) => n.split(" ")[1];

    it("popular: most followers first", () =>
      withRollback(async (c) => {
        const t = await seed(c);
        const page = await listChannels({ q: t, sort: "popular", limit: 50 }, c);
        expect(page.items.map((i) => i.followers)).toEqual([12000, 9000, 500, 500, 100]);
      }));

    it("newest: latest created first", () =>
      withRollback(async (c) => {
        const t = await seed(c);
        const page = await listChannels({ q: t, sort: "newest", limit: 50 }, c);
        expect(page.items.map((i) => suffix(i.name))).toEqual(["Charlie", "Echo", "Delta", "Bravo", "alpha"]);
      }));

    it("name: A to Z, ignoring case", () =>
      withRollback(async (c) => {
        const t = await seed(c);
        const page = await listChannels({ q: t, sort: "name", limit: 50 }, c);
        expect(page.items.map((i) => suffix(i.name))).toEqual(["alpha", "Bravo", "Charlie", "Delta", "Echo"]);
      }));

    for (const sort of ["popular", "newest", "name"] as const) {
      it(`${sort}: walking every page yields each channel exactly once, in order`, () =>
        withRollback(async (c) => {
          const t = await seed(c);
          const full = (await listChannels({ q: t, sort, limit: 50 }, c)).items.map((i) => i.handle);
          const walked: string[] = [];
          let cursor: string | undefined;
          let pages = 0;
          do {
            const page = await listChannels({ q: t, sort, limit: 2, cursor }, c);
            walked.push(...page.items.map((i) => i.handle));
            cursor = page.nextCursor ?? undefined;
            pages++;
          } while (cursor && pages < 10);
          expect(pages).toBe(3);
          expect(walked).toEqual(full);
          expect(new Set(walked).size).toBe(5);
        }));
    }

    it("has no next cursor when everything fits", () =>
      withRollback(async (c) => {
        const t = await seed(c);
        expect((await listChannels({ q: t, limit: 5 }, c)).nextCursor).toBeNull();
        expect((await listChannels({ q: t, limit: 4 }, c)).nextCursor).not.toBeNull();
      }));
  });

  describe("filters", () => {
    it("category", () =>
      withRollback(async (c) => {
        const t = token();
        await channel(c, t, { category: "music" });
        await channel(c, t, { category: "faith" });
        const music = await listChannels({ q: t, category: "music" }, c);
        expect(music.items.map((i) => i.categorySlug)).toEqual(["music"]);
      }));

    it("scope: large = 10K+, growing = under 10K", () =>
      withRollback(async (c) => {
        const t = token();
        await channel(c, t, { followers: 10000 });
        await channel(c, t, { followers: 9999 });
        expect((await listChannels({ q: t, scope: "large" }, c)).items.map((i) => i.followers)).toEqual([10000]);
        expect((await listChannels({ q: t, scope: "growing" }, c)).items.map((i) => i.followers)).toEqual([9999]);
        expect((await listChannels({ q: t, scope: "all" }, c)).items).toHaveLength(2);
      }));

    it("featured: exclude / only", () =>
      withRollback(async (c) => {
        const t = token();
        await channel(c, t, { featured: true });
        await channel(c, t, { featured: false });
        expect((await listChannels({ q: t, featured: "exclude" }, c)).items.every((i) => !i.featured)).toBe(true);
        expect((await listChannels({ q: t, featured: "only" }, c)).items.every((i) => i.featured)).toBe(true);
        expect((await listChannels({ q: t }, c)).items).toHaveLength(2);
      }));

    it("search matches name, handle, description and category name, ignoring case", () =>
      withRollback(async (c) => {
        const t = token();
        await channel(c, t, { name: `${t} Whale`, handle: `${t}_one`, description: "x" });
        await channel(c, t, { name: `${t} Plain`, handle: `${t}_two`, description: "about SUNRISE hikes" });
        await channel(c, t, { name: `${t} Third`, handle: `${t}_three`, category: "wellness", description: "x" });
        expect((await listChannels({ q: `${t} whale` }, c)).items).toHaveLength(1); // name
        expect((await listChannels({ q: `${t}_two` }, c)).items).toHaveLength(1); // handle
        expect((await listChannels({ q: `${t.toUpperCase()}` }, c)).items).toHaveLength(3); // case-insensitive
        expect((await listChannels({ q: "sunrise hikes" }, c)).items.some((i) => i.handle === `${t}_two`)).toBe(true); // description
        expect((await listChannels({ q: "wellness" }, c)).items.some((i) => i.handle === `${t}_three`)).toBe(true); // category
      }));

    it("treats % and _ in the search as plain characters, not wildcards", () =>
      withRollback(async (c) => {
        const t = token();
        await channel(c, t, { name: `${t} 100% joy` });
        await channel(c, t, { name: `${t} 1000 joy` });
        await channel(c, t, { name: `${t} a_b` });
        await channel(c, t, { name: `${t} axb` });
        expect((await listChannels({ q: "100% joy" }, c)).items.map((i) => i.name)).toEqual([`${t} 100% joy`]);
        expect((await listChannels({ q: `${t} a_b` }, c)).items.map((i) => i.name)).toEqual([`${t} a_b`]);
      }));

    it("is safe against SQL injection attempts in the search", () =>
      withRollback(async (c) => {
        const page = await listChannels({ q: "x'; drop table public.channels; --" }, c);
        expect(page.items).toEqual([]);
        expect((await c.query("select count(*)::int n from public.channels")).rows[0].n).toBeGreaterThanOrEqual(0);
      }));
  });

  describe("input validation", () => {
    describe("tampered cursors", () => {
      const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
      // each case gets its own transaction: a failed statement aborts a Postgres transaction
      const cases: [string, Parameters<typeof listChannels>[0]][] = [
        ["not base64 json", { cursor: "garbage" }],
        ["wrong key type for popular", { sort: "popular", cursor: enc({ k: "text", id: randomUUID() }) }],
        ["id is not a uuid", { sort: "popular", cursor: enc({ k: 5, id: "not-a-uuid" }) }],
        ["date is not a date", { sort: "newest", cursor: enc({ k: "yesterday-ish", id: randomUUID() }) }],
        ["number used for name sort", { sort: "name", cursor: enc({ k: 5, id: randomUUID() }) }],
      ];
      for (const [name, input] of cases) {
        it(`rejects: ${name}`, () =>
          withRollback(async (c) => {
            await expect(listChannels(input, c)).rejects.toMatchObject({ code: "VALIDATION" });
          }));
      }
    });

    it("rejects unknown sorts, bad limits and malformed categories", () =>
      withRollback(async (c) => {
        await expect(listChannels({ sort: "random" as never }, c)).rejects.toMatchObject({ name: "ZodError" });
        await expect(listChannels({ limit: 0 }, c)).rejects.toMatchObject({ name: "ZodError" });
        await expect(listChannels({ limit: 51 }, c)).rejects.toMatchObject({ name: "ZodError" });
        await expect(listChannels({ category: "Bad Slug!" }, c)).rejects.toMatchObject({ name: "ZodError" });
      }));

    it("an unknown but well-formed category simply matches nothing", () =>
      withRollback(async (c) => {
        expect((await listChannels({ category: "does-not-exist" }, c)).items).toEqual([]);
      }));
  });
});

describe("getFeaturedChannel", () => {
  it("returns the most-followed featured channel, ignoring inactive ones", () =>
    withRollback(async (c) => {
      await c.query("update public.channels set featured = false");
      const t = token();
      await channel(c, t, { featured: true, followers: 10 });
      const best = await channel(c, t, { featured: true, followers: 999 });
      await channel(c, t, { featured: true, followers: 99999, status: "paused" });
      expect((await getFeaturedChannel(c))?.handle).toBe(best.handle);
    }));

  it("returns null when nothing is featured", () =>
    withRollback(async (c) => {
      await c.query("update public.channels set featured = false");
      expect(await getFeaturedChannel(c)).toBeNull();
    }));
});

describe("getChannelProfile", () => {
  it("404s for unknown, malformed and inactive handles", () =>
    withRollback(async (c) => {
      const t = token();
      const paused = await channel(c, t, { status: "paused" });
      const pending = await channel(c, t, { status: "pending" });
      for (const h of ["nope_" + t, "ab", "has space", "../etc", "", paused.handle, pending.handle]) {
        await expect(getChannelProfile(h, c)).rejects.toMatchObject({ code: "NOT_FOUND" });
      }
    }));

  it("is case-insensitive on the handle", () =>
    withRollback(async (c) => {
      const t = token();
      const ch = await channel(c, t);
      expect((await getChannelProfile(ch.handle.toUpperCase(), c)).channel.handle).toBe(ch.handle);
    }));

  it("returns about, mission, ordered links and only published content (newest first)", () =>
    withRollback(async (c) => {
      const t = token();
      const ch = await channel(c, t);
      await c.query("update public.channels set about = $2, mission = 'Our mission' where id = $1", [ch.id, ["One.", "Two."]]);
      await c.query(
        `insert into public.channel_links (channel_id, label, href, position) values ($1,'B','https://b.example',1), ($1,'A','https://a.example',0)`,
        [ch.id],
      );
      await c.query(
        `insert into public.channel_content (channel_id, kind, title, excerpt, youtube_id, published_at) values
         ($1,'reflection','Old','e','dQw4w9WgXcQ', now() - interval '10 days'),
         ($1,'video','New','e', null, now() - interval '1 day'),
         ($1,'story','Draft','e', null, null),
         ($1,'message','Future','e', null, now() + interval '5 days')`,
        [ch.id],
      );
      const { data } = await getChannelProfile(ch.handle, c);
      expect(data.about).toEqual(["One.", "Two."]);
      expect(data.mission).toBe("Our mission");
      expect(data.links.map((l) => l.label)).toEqual(["A", "B"]);
      expect(data.content.map((x) => x.title)).toEqual(["New", "Old"]);
      expect(data.content[0].kind).toBe("Video");
      expect(data.content[1]).toMatchObject({ kind: "Reflection", youtubeId: "dQw4w9WgXcQ" });
      expect(data.content[0]).not.toHaveProperty("youtubeId");
      expect(data.content[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }));

  it("protects supporters: anonymous names masked, amounts only when opted in, no emails or ids leaked", () =>
    withRollback(async (c) => {
      const t = token();
      const ch = await channel(c, t);
      const donate = async (email: string, cents: number) => {
        const { rows } = await c.query<{ id: string }>(
          "insert into public.donations (channel_id, donor_email, amount_cents, currency) values ($1,$2,$3,'USD') returning id",
          [ch.id, email, cents],
        );
        await c.query("update public.donations set status = 'succeeded' where id = $1", [rows[0].id]);
        return rows[0].id;
      };
      const d1 = await donate("sarah@example.com", 2500);
      const d2 = await donate("secret@example.com", 9900);
      const d3 = await donate("hidden-amount@example.com", 700);
      await c.query(
        `insert into public.blessings (donation_id, channel_id, display_name, message, show_amount, is_anonymous, created_at) values
         ($1,$4,'Sarah','Thank you',true,false, now() - interval '1 hour'),
         ($2,$4,'Secret Person','Quiet thanks',true,true, now() - interval '2 hours'),
         ($3,$4,'Daniel','Helps me',false,false, now() - interval '3 hours')`,
        [d1, d2, d3, ch.id],
      );
      const { data } = await getChannelProfile(ch.handle, c);
      expect(data.blessingsCount).toBe(3);
      expect(data.blessings.map((b) => b.name)).toEqual(["Sarah", "Anonymous", "Daniel"]);
      expect(data.blessings[0].amount).toBe(25);
      expect(data.blessings[1].amount).toBe(99); // anonymous name, but they chose to show the amount
      expect(data.blessings[2]).not.toHaveProperty("amount");
      const json = JSON.stringify(data);
      for (const leak of ["Secret Person", "secret@example.com", "sarah@example.com", d1, d2]) expect(json).not.toContain(leak);
    }));

  it("hides removed blessings", () =>
    withRollback(async (c) => {
      const t = token();
      const ch = await channel(c, t);
      const { rows } = await c.query<{ id: string }>(
        "insert into public.donations (channel_id, amount_cents, currency) values ($1, 500, 'USD') returning id",
        [ch.id],
      );
      await c.query("update public.donations set status = 'succeeded' where id = $1", [rows[0].id]);
      await c.query("insert into public.blessings (donation_id, channel_id, message, status) values ($1,$2,'bad','removed')", [rows[0].id, ch.id]);
      const { data } = await getChannelProfile(ch.handle, c);
      expect(data.blessings).toEqual([]);
      expect(data.blessingsCount).toBe(0);
    }));
});

describe("follows", () => {
  it("follow is idempotent and the count goes up once", () =>
    withRollback(async (c) => {
      const t = token();
      const ch = await channel(c, t, { followers: 0 });
      const me = await member(c);
      expect(await isFollowing(me, ch.handle, c)).toBe(false);
      expect(await followChannel(me, ch.handle, c)).toEqual({ following: true, followerCount: 1 });
      expect(await followChannel(me, ch.handle, c)).toEqual({ following: true, followerCount: 1 });
      expect(await isFollowing(me, ch.handle, c)).toBe(true);
    }));

  it("unfollow is idempotent and the count goes down once", () =>
    withRollback(async (c) => {
      const t = token();
      const ch = await channel(c, t);
      const a = await member(c);
      const b = await member(c);
      await followChannel(a, ch.handle, c);
      await followChannel(b, ch.handle, c);
      expect(await unfollowChannel(a, ch.handle, c)).toEqual({ following: false, followerCount: 1 });
      expect(await unfollowChannel(a, ch.handle, c)).toEqual({ following: false, followerCount: 1 });
      expect(await isFollowing(b, ch.handle, c)).toBe(true);
    }));

  it("requires an active signed-in member", () =>
    withRollback(async (c) => {
      const ch = await channel(c, token());
      await expect(followChannel(null, ch.handle, c)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      await expect(unfollowChannel(null, ch.handle, c)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      const banned = await member(c, "suspended");
      await expect(followChannel(banned, ch.handle, c)).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await isFollowing(null, ch.handle, c)).toBe(false);
      expect(await isFollowing(banned, ch.handle, c)).toBe(false);
    }));

  it("can't follow unknown, malformed or inactive channels", () =>
    withRollback(async (c) => {
      const t = token();
      const paused = await channel(c, t, { status: "paused" });
      const me = await member(c);
      for (const h of ["nope_" + t, "x", "bad handle", paused.handle]) {
        await expect(followChannel(me, h, c)).rejects.toMatchObject({ code: "NOT_FOUND" });
      }
    }));

  it("lets you unfollow a channel that has since been paused", () =>
    withRollback(async (c) => {
      const ch = await channel(c, token());
      const me = await member(c);
      await followChannel(me, ch.handle, c);
      await c.query("update public.channels set status = 'paused' where id = $1", [ch.id]);
      await expect(unfollowChannel(me, ch.handle, c)).resolves.toMatchObject({ following: false });
    }));

  it("rate-limits follow spam per user", () =>
    withRollback(async (c) => {
      const ch = await channel(c, token());
      const me = await member(c);
      for (let i = 0; i < RATE_LIMITS.follow.limit; i++) await hit(`follow:${me.userId}`, RATE_LIMITS.follow, c);
      await expect(followChannel(me, ch.handle, c)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    }));

  it("listMyFollowing: newest follow first, active channels only, paginated", () =>
    withRollback(async (c) => {
      const t = token();
      const me = await member(c);
      const chans = [];
      for (let i = 0; i < 4; i++) chans.push(await channel(c, t));
      const gone = await channel(c, t);
      // explicit, well-separated follow times
      for (const [i, ch] of [...chans, gone].entries()) {
        await c.query(
          "insert into public.channel_follows (channel_id, user_id, created_at) values ($1,$2, now() - ($3 || ' hours')::interval)",
          [ch.id, me.userId, String(10 - i)],
        );
      }
      await c.query("update public.channels set status = 'archived' where id = $1", [gone.id]);

      const all = await listMyFollowing(me, { limit: 50 }, c);
      expect(all.items.map((i) => i.handle)).toEqual([...chans].reverse().map((x) => x.handle));

      const p1 = await listMyFollowing(me, { limit: 3 }, c);
      expect(p1.items).toHaveLength(3);
      const p2 = await listMyFollowing(me, { limit: 3, cursor: p1.nextCursor! }, c);
      expect([...p1.items, ...p2.items].map((i) => i.handle)).toEqual(all.items.map((i) => i.handle));
      expect(p2.nextCursor).toBeNull();

      const stranger = await member(c);
      expect((await listMyFollowing(stranger, {}, c)).items).toEqual([]);
      await expect(listMyFollowing(null, {}, c)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      await expect(listMyFollowing(me, { cursor: "bogus" }, c)).rejects.toMatchObject({ code: "VALIDATION" });
    }));
});
