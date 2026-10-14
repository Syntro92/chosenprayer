import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db, getPool, one, rows, tx, type Queryable } from "@/server/db";
import { enforceRateLimit, hit } from "@/server/rate-limit";
import { withRollback } from "../helpers/rollback";

afterAll(async () => {
  await getPool().end();
});

describe("db helpers", () => {
  it("connects and answers", async () => {
    expect((await one<{ x: number }>("select 1 as x"))?.x).toBe(1);
  });

  it("parses bigint columns as numbers", async () => {
    expect((await one<{ n: number }>("select count(*) as n from public.categories"))?.n).toBe(8);
  });

  it("tx commits on success and rolls back on throw", async () => {
    const key = `test:tx:${randomUUID()}`;
    const insert = (c: Queryable) =>
      c.query("insert into public.rate_limits (key, window_start, count) values ($1, now(), 1)", [key]);
    try {
      await expect(
        tx(async (c) => {
          await insert(c);
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      expect(await rows("select 1 from public.rate_limits where key = $1", [key])).toHaveLength(0);

      await tx(insert);
      expect(await rows("select 1 from public.rate_limits where key = $1", [key])).toHaveLength(1);
    } finally {
      await db.query("delete from public.rate_limits where key = $1", [key]);
    }
  });
});

describe("rate limiter", () => {
  const rule = { limit: 3, windowSeconds: 60 };

  it("allows up to the limit, then blocks with a retry time", () =>
    withRollback(async (c) => {
      const key = `test:${randomUUID()}`;
      const results = [];
      for (let i = 0; i < 5; i++) results.push(await hit(key, rule, c));
      expect(results.map((r) => r.allowed)).toEqual([true, true, true, false, false]);
      expect(results[0].remaining).toBe(2);
      expect(results[3].remaining).toBe(0);
      expect(results[3].retryAfter).toBeGreaterThanOrEqual(1);
      expect(results[3].retryAfter).toBeLessThanOrEqual(60);
    }));

  it("counts keys independently", () =>
    withRollback(async (c) => {
      const a = `test:${randomUUID()}`;
      const b = `test:${randomUUID()}`;
      for (let i = 0; i < 4; i++) await hit(a, rule, c);
      expect((await hit(a, rule, c)).allowed).toBe(false);
      expect((await hit(b, rule, c)).allowed).toBe(true);
    }));

  it("enforceRateLimit throws RATE_LIMITED with retryAfter", () =>
    withRollback(async (c) => {
      const id = randomUUID();
      for (let i = 0; i < 10; i++) await enforceRateLimit("signin", id, c);
      await expect(enforceRateLimit("signin", id, c)).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
      await expect(enforceRateLimit("signin", id, c)).rejects.toHaveProperty("retryAfter");
    }));

  it("rejects nonsensical rules", () =>
    withRollback(async (c) => {
      await expect(hit("x", { limit: 0, windowSeconds: 60 }, c)).rejects.toThrow(/positive/);
    }));
});

describe("migration 0008", () => {
  async function channel(c: Queryable) {
    const r = await c.query<{ id: string }>(
      "insert into public.channels (handle, name, category, status) values ($1, 'T', 'faith', 'active') returning id",
      [`t_${randomUUID().slice(0, 8)}`],
    );
    return r.rows[0].id;
  }

  it("gives every donation a unique secret public_token", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const ins = () =>
        c.query<{ public_token: string }>(
          "insert into public.donations (channel_id, amount_cents, currency) values ($1, 500, 'USD') returning public_token",
          [ch],
        );
      const [a, b] = [(await ins()).rows[0].public_token, (await ins()).rows[0].public_token];
      expect(a).toMatch(/^[0-9a-f]{48}$/);
      expect(a).not.toBe(b);
    }));

  it("makes donation creation idempotent by key", () =>
    withRollback(async (c) => {
      const ch = await channel(c);
      const ins = (k: string) =>
        c.query("insert into public.donations (channel_id, amount_cents, currency, idempotency_key) values ($1, 500, 'USD', $2)", [ch, k]);
      await ins("idem-key-12345");
      await c.query("savepoint s");
      await expect(ins("idem-key-12345")).rejects.toMatchObject({ code: "23505" });
      await c.query("rollback to savepoint s");
      await expect(ins("short")).rejects.toMatchObject({ code: "23514" });
    }));

  it("keeps the new server-only tables away from anon and signed-in users", () =>
    withRollback(async (c) => {
      for (const role of ["anon", "authenticated"]) {
        await c.query(`set local role ${role}`);
        for (const table of ["rate_limits", "email_outbox", "cron_runs"]) {
          await c.query("savepoint s");
          await expect(c.query(`select * from public.${table}`)).rejects.toMatchObject({ code: "42501" });
          await c.query("rollback to savepoint s");
        }
        await c.query("savepoint s");
        await expect(c.query("select * from public.rate_limit_hit('x', 1, 60)")).rejects.toMatchObject({ code: "42501" });
        await c.query("rollback to savepoint s");
        await c.query("reset role");
      }
    }));

  it("email_outbox only accepts valid statuses", () =>
    withRollback(async (c) => {
      await c.query("insert into public.email_outbox (to_email, template) values ('a@example.com', 'receipt')");
      await expect(
        c.query("insert into public.email_outbox (to_email, template, status) values ('a@example.com', 'x', 'weird')"),
      ).rejects.toMatchObject({ code: "23514" });
    }));
});
