import { getPool } from "@/server/db";
import type { Queryable } from "@/server/db";

/** Runs `fn` inside a transaction that is ALWAYS rolled back, so tests leave nothing behind. */
export async function withRollback<T>(fn: (conn: Queryable) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    return await fn(client);
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
  }
}
