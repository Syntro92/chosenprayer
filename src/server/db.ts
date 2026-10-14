import "server-only";
import pg from "pg";
import { getEnv } from "./env";

// bigint (int8) -> number. Every bigint we store (counters, cents totals) is far below 2^53.
pg.types.setTypeParser(20, (v) => Number(v));

/** Anything that can run a query: the pool, or a transaction's client. Repos accept this. */
export interface Queryable {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: unknown[]): Promise<pg.QueryResult<R>>;
}

const globalForPool = globalThis as unknown as { __pgPool?: pg.Pool };

function createPool(): pg.Pool {
  const env = getEnv();
  const pool = new pg.Pool({
    // Transaction pooler when available (serverless-friendly); otherwise the session URL.
    connectionString: env.DATABASE_URL_POOLER ?? env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: env.NODE_ENV === "production" ? 5 : 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    statement_timeout: 15_000,
    application_name: "donation-app",
  });
  // An idle client erroring (e.g. pooler restart) must not crash the process.
  pool.on("error", (err) => console.error(JSON.stringify({ level: "error", msg: "pg pool error", err: err.message })));
  return pool;
}

/** One pool per server process; kept on globalThis so dev hot-reload doesn't leak connections. */
export function getPool(): pg.Pool {
  return (globalForPool.__pgPool ??= createPool());
}

export const db: Queryable = {
  query: (text, params) => getPool().query(text, params as unknown[]),
};

/** Convenience: run a query and return the rows. */
export async function rows<R extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
  conn: Queryable = db,
): Promise<R[]> {
  return (await conn.query<R>(text, params)).rows;
}

/** Convenience: first row or null. */
export async function one<R extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
  conn: Queryable = db,
): Promise<R | null> {
  return (await conn.query<R>(text, params)).rows[0] ?? null;
}

/**
 * Run `fn` in a transaction. Commits if it resolves, rolls back if it throws.
 * Use it whenever several writes must succeed or fail together (e.g. a business
 * change + its notification + its queued email).
 */
export async function tx<T>(fn: (conn: Queryable) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Run `fn` atomically. If `conn` is the shared pool this opens a real transaction;
 * if the caller already supplied a transaction client (tests, or a larger unit of
 * work) it simply runs inside that one.
 */
export function inTransaction<T>(conn: Queryable, fn: (c: Queryable) => Promise<T>): Promise<T> {
  return conn === db ? tx(fn) : fn(conn);
}
