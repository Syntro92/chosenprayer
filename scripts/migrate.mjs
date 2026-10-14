/**
 * Minimal SQL migration runner.
 *
 *   node --env-file=.env scripts/migrate.mjs up       apply pending migrations (default)
 *   node --env-file=.env scripts/migrate.mjs status   list applied / pending
 *
 * Files live in db/migrations as <version>_<name>.sql and run in version order,
 * each inside its own transaction. Applied versions are recorded in
 * supabase_migrations.schema_migrations (the same table the Supabase CLI uses),
 * together with the SQL that was run. An applied file that has since been edited
 * is reported as drift and blocks further migrations: add a new migration instead.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");
const command = process.argv[2] ?? "up";
const LOCK_KEY = 7_265_001; // arbitrary app-wide advisory lock id

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (run with --env-file=.env)");
  process.exit(1);
}

const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
const migrations = await Promise.all(
  files.map(async (file) => {
    const [version, ...rest] = file.replace(/\.sql$/, "").split("_");
    return { file, version, name: rest.join("_"), sql: await readFile(path.join(dir, file), "utf8") };
  }),
);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query("create schema if not exists supabase_migrations");
  await client.query(`create table if not exists supabase_migrations.schema_migrations (
    version text primary key, statements text[], name text)`);

  const { rows } = await client.query("select version, statements from supabase_migrations.schema_migrations");
  const applied = new Map(rows.map((r) => [r.version, r.statements?.[0] ?? null]));

  const drift = migrations.filter((m) => applied.has(m.version) && applied.get(m.version) !== m.sql);
  const pending = migrations.filter((m) => !applied.has(m.version));

  if (command === "status") {
    for (const m of migrations) {
      const state = !applied.has(m.version) ? "pending" : drift.includes(m) ? "DRIFT  " : "applied";
      console.log(`${state}  ${m.file}`);
    }
    process.exit(drift.length ? 1 : 0);
  }

  if (command !== "up") throw new Error(`Unknown command "${command}" (use up | status)`);
  if (drift.length) {
    throw new Error(`Applied migrations were edited: ${drift.map((m) => m.file).join(", ")}. Add a new migration instead.`);
  }

  await client.query("select pg_advisory_lock($1)", [LOCK_KEY]);
  for (const m of pending) {
    process.stdout.write(`applying ${m.file} ... `);
    try {
      await client.query("begin");
      await client.query(m.sql);
      await client.query(
        "insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)",
        [m.version, m.name, [m.sql]],
      );
      await client.query("commit");
      console.log("ok");
    } catch (e) {
      await client.query("rollback");
      console.log("FAILED");
      throw e;
    }
  }
  console.log(pending.length ? `done (${pending.length} applied)` : "up to date");
} catch (e) {
  console.error(e.message, e.position ? `(at char ${e.position})` : "");
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
