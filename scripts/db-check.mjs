import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  const { rows } = await client.query(
    "select current_database() db, current_user usr, version() v, (select count(*) from information_schema.tables where table_schema='public') public_tables"
  );
  console.log("CONNECTED", rows[0]);
} catch (e) {
  console.error("FAILED:", e.code, e.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
