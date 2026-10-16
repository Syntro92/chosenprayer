/**
 * Schema smoke test. Runs entirely inside one transaction that is ALWAYS rolled
 * back, so it leaves nothing behind.   node --env-file=.env scripts/db-smoke.mjs
 */
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

let passed = 0;
const failures = [];
const q = (sql, params) => client.query(sql, params);
const ok = (name, cond, extra = "") => {
  if (cond) passed++;
  else failures.push(`${name} ${extra}`);
};
/** Expect the statement to fail (optionally with a given SQLSTATE), without aborting the transaction. */
async function rejects(name, sql, params, code) {
  await q("savepoint s");
  try {
    await q(sql, params);
    failures.push(`${name}: expected an error but it succeeded`);
    await q("release savepoint s");
  } catch (e) {
    if (code && e.code !== code) failures.push(`${name}: expected ${code}, got ${e.code} (${e.message})`);
    else passed++;
    await q("rollback to savepoint s");
  }
}
async function as(role, uid) {
  await q(`set local role ${role}`);
  await q("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [
    JSON.stringify(uid ? { sub: uid, role } : { role }),
    uid ?? "",
  ]);
}
const reset = () => q("reset role");

try {
  await q("begin");

  // --- RLS is on for every table in public ---------------------------------
  const { rows: noRls } = await q(
    `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
  );
  ok("RLS enabled on all public tables", noRls.length === 0, noRls.map((r) => r.relname).join(","));

  // --- Accounts ---------------------------------------------------------------
  const [alice, bob, mod, carol] = [0, 1, 2, 3].map(() => crypto.randomUUID());
  const mkUser = (id, email, meta = {}) =>
    q("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [id, email, JSON.stringify(meta)]);
  await mkUser(alice, "alice@example.com", { full_name: "Alice Perera" });
  await mkUser(bob, "alice@other.com"); // same local-part -> username must be uniquified
  await mkUser(mod, "mod@example.com");
  await mkUser(carol, "carol@example.com");
  const { rows: profs } = await q("select id, username, display_name from public.profiles where id = any($1)", [[alice, bob]]);
  const pa = profs.find((p) => p.id === alice);
  const pb = profs.find((p) => p.id === bob);
  ok("profile auto-created with full_name", pa?.display_name === "Alice Perera" && pa?.username === "alice");
  ok("duplicate username auto-suffixed", pb && pb.username !== "alice" && pb.username.startsWith("alice"), pb?.username);
  await q("update public.profiles set role = 'admin' where id = $1", [mod]);

  // --- Channels + giving ----------------------------------------------------------
  const { rows: [ch] } = await q(
    `insert into public.channels (handle, owner_id, name, category, status) values ('smoke_channel', $1, 'Smoke', 'faith', 'active') returning id`,
    [alice],
  );
  const { rows: [paused] } = await q(
    `insert into public.channels (handle, name, category, status) values ('smoke_paused', 'Paused', 'faith', 'paused') returning id`,
  );
  await rejects("bad handle rejected", `insert into public.channels (handle, name, category) values ('A!', 'x', 'faith')`, [], "23514");
  await rejects("unknown category rejected", `insert into public.channels (handle, name, category) values ('smoke_x1', 'x', 'nope')`, [], "23503");
  await rejects("donation to paused channel blocked", `insert into public.donations (channel_id, amount_cents, currency) values ($1, 500, 'USD')`, [paused.id], "23514");
  await rejects("donation currency mismatch blocked", `insert into public.donations (channel_id, amount_cents, currency) values ($1, 500, 'EUR')`, [ch.id], "23514");
  await rejects("zero amount blocked", `insert into public.donations (channel_id, amount_cents, currency) values ($1, 0, 'USD')`, [ch.id], "23514");

  const mkDonation = async (donor, email, cents) =>
    (await q(
      `insert into public.donations (channel_id, donor_id, donor_email, donor_name, amount_cents, currency) values ($1, $2, $3, 'D', $4, 'USD') returning id`,
      [ch.id, donor, email, cents],
    )).rows[0].id;
  const d1 = await mkDonation(bob, null, 2500);
  const d2 = await mkDonation(null, "guest@example.com", 1100);
  let { rows: [st] } = await q("select supporter_count, total_raised_cents, blessing_count from public.channels where id = $1", [ch.id]);
  ok("pending donations don't count", st.supporter_count === 0 && Number(st.total_raised_cents) === 0);
  await rejects("blessing on unpaid donation blocked", `insert into public.blessings (donation_id, channel_id, message) values ($1, $2, 'hi')`, [d1, ch.id], "23514");

  await q("update public.donations set status = 'succeeded' where id = any($1)", [[d1, d2]]);
  ({ rows: [st] } = await q("select supporter_count, total_raised_cents from public.channels where id = $1", [ch.id]));
  ok("succeeded donations update stats", st.supporter_count === 2 && Number(st.total_raised_cents) === 3600, JSON.stringify(st));
  const { rows: [paid] } = await q("select paid_at from public.donations where id = $1", [d1]);
  ok("paid_at set automatically", paid.paid_at !== null);

  await q(`insert into public.blessings (donation_id, channel_id, author_id, display_name, message, show_amount) values ($1, $2, $3, 'Bob', 'Bless you', true)`, [d1, ch.id, bob]);
  await q(`insert into public.blessings (donation_id, channel_id, display_name, is_anonymous, message) values ($1, $2, 'Secret Name', true, 'Quiet thanks')`, [d2, ch.id]);
  await rejects("one blessing per donation", `insert into public.blessings (donation_id, channel_id, message) values ($1, $2, 'again')`, [d1, ch.id], "23505");
  const d3 = await mkDonation(null, "third@example.com", 900);
  await q("update public.donations set status = 'succeeded' where id = $1", [d3]);
  await rejects("blessing channel must match donation", `insert into public.blessings (donation_id, channel_id, message) values ($1, $2, 'x')`, [d3, paused.id], "23503");
  const { rows: feed } = await q("select name, amount_cents from public.channel_blessings_public where channel_id = $1 order by name", [ch.id]);
  ok("anonymous blessing masked, amount hidden", feed.some((r) => r.name === "Anonymous" && r.amount_cents === null) && !JSON.stringify(feed).includes("Secret Name"));
  ok("amount shown only when opted in", feed.some((r) => r.name === "Bob" && r.amount_cents === 2500));
  ({ rows: [st] } = await q("select blessing_count from public.channels where id = $1", [ch.id]));
  ok("blessing_count maintained", st.blessing_count === 2);

  await q("update public.donations set status = 'refunded' where id = $1", [d1]);
  ({ rows: [st] } = await q("select supporter_count, total_raised_cents from public.channels where id = $1", [ch.id]));
  ok("refund removes from stats", st.supporter_count === 2 && Number(st.total_raised_cents) === 2000, JSON.stringify(st));

  await q("insert into public.channel_follows (channel_id, user_id) values ($1, $2), ($1, $3)", [ch.id, alice, bob]);
  ({ rows: [st] } = await q("select follower_count from public.channels where id = $1", [ch.id]));
  ok("follower_count maintained", st.follower_count === 2);

  // --- Community ----------------------------------------------------------------------
  const { rows: [post] } = await q("insert into public.posts (author_id, body) values ($1, 'Hello') returning id", [alice]);
  await rejects("post over 1000 chars rejected", `insert into public.posts (author_id, body) values ($1, repeat('x', 1001))`, [alice], "23514");
  const { rows: [c1] } = await q("insert into public.comments (post_id, author_id, body) values ($1, $2, 'top') returning id", [post.id, bob]);
  const { rows: [r1] } = await q("insert into public.comments (post_id, author_id, parent_id, body) values ($1, $2, $3, 'reply') returning id", [post.id, alice, c1.id]);
  await rejects("reply-to-reply rejected", `insert into public.comments (post_id, author_id, parent_id, body) values ($1, $2, $3, 'deep')`, [post.id, bob, r1.id], "23514");
  const { rows: [other] } = await q("insert into public.posts (author_id, body) values ($1, 'other') returning id", [alice]);
  await rejects("reply must stay on the same post", `insert into public.comments (post_id, author_id, parent_id, body) values ($1, $2, $3, 'x')`, [other.id, bob, c1.id], "23503");
  let { rows: [pc] } = await q("select comment_count, like_count from public.posts where id = $1", [post.id]);
  ok("comment_count maintained", pc.comment_count === 2);
  await q("insert into public.post_likes (post_id, user_id) values ($1, $2), ($1, $3)", [post.id, alice, bob]);
  ({ rows: [pc] } = await q("select comment_count, like_count from public.posts where id = $1", [post.id]));
  ok("like_count maintained", pc.like_count === 2);
  await rejects("double like rejected", `insert into public.post_likes (post_id, user_id) values ($1, $2)`, [post.id, alice], "23505");
  await q("update public.posts set body = 'Hello!' where id = $1", [post.id]);
  const { rows: [ed] } = await q("select edited_at from public.posts where id = $1", [post.id]);
  ok("edited_at stamped on body change", ed.edited_at !== null);
  await q("delete from public.comments where id = $1", [c1.id]);
  ({ rows: [pc] } = await q("select comment_count from public.posts where id = $1", [post.id]));
  ok("deleting a comment cascades replies and recounts", pc.comment_count === 0);

  const att = (n, kind, mime) =>
    q(`insert into public.post_attachments (post_id, kind, name, size_bytes, mime, storage_path) values ($1, $2, 'f', 1000, $3, $4)`, [post.id, kind, mime, `${post.id}/${n}`]);
  for (let i = 0; i < 4; i++) await att(i, "image", "image/png");
  await rejects("5th image rejected", `insert into public.post_attachments (post_id, kind, name, size_bytes, mime, storage_path) values ($1, 'image', 'f', 1, 'image/png', 'x5')`, [post.id], "23514");
  await att(10, "file", "application/pdf");
  await att(11, "file", "text/plain");
  await rejects("7th attachment rejected", `insert into public.post_attachments (post_id, kind, name, size_bytes, mime, storage_path) values ($1, 'file', 'f', 1, 'text/plain', 'x7')`, [post.id], "23514");
  await rejects("oversize file rejected", `insert into public.post_attachments (post_id, kind, name, size_bytes, mime, storage_path) values ($1, 'file', 'f', 5242881, 'text/plain', 'big')`, [other.id], "23514");
  await rejects("mime/kind mismatch rejected", `insert into public.post_attachments (post_id, kind, name, size_bytes, mime, storage_path) values ($1, 'image', 'f', 1, 'application/pdf', 'mm')`, [other.id], "23514");

  await q("insert into public.reports (reporter_id, post_id, reason) values ($1, $2, 'spam')", [bob, post.id]);
  await rejects("duplicate report rejected", `insert into public.reports (reporter_id, post_id, reason) values ($1, $2, 'spam')`, [bob, post.id], "23505");
  await rejects("a removed post must record when it was removed", `update public.posts set status = 'removed' where id = $1`, [post.id], "23514");
  await rejects("a handled report must record when it was handled", `update public.reports set status = 'dismissed' where post_id = $1`, [post.id], "23514");
  await rejects("report needs exactly one target", `insert into public.reports (reporter_id, reason) values ($1, 'spam')`, [bob], "23514");

  // --- RLS behaviour -----------------------------------------------------------------
  await as("anon");
  ok("anon sees active channel", (await q("select 1 from public.channels where id = $1", [ch.id])).rowCount === 1);
  ok("anon does not see paused channel", (await q("select 1 from public.channels where id = $1", [paused.id])).rowCount === 0);
  ok("anon sees masked blessings view", (await q("select 1 from public.channel_blessings_public")).rowCount >= 2);
  await rejects("anon cannot read donations", "select * from public.donations", [], "42501");
  await rejects("anon cannot read blessings table", "select * from public.blessings", [], "42501");
  await rejects("anon cannot read profiles", "select * from public.profiles", [], "42501");
  await rejects("anon cannot read posts", "select * from public.posts", [], "42501");
  await rejects("anon cannot read settings", "select * from public.site_settings", [], "42501");
  await reset();

  await as("authenticated", bob);
  ok("member reads visible posts", (await q("select 1 from public.posts where id = $1", [post.id])).rowCount === 1);
  ok("member sees only own donations", (await q("select 1 from public.donations")).rowCount === 1);
  await rejects("member cannot self-promote", "update public.profiles set role = 'admin' where id = $1", [bob], "42501");
  await rejects("member cannot verify self", "update public.profiles set verified = true where id = $1", [bob], "42501");
  const upd = await q("update public.profiles set bio = 'hi' where id = $1", [bob]);
  ok("member can edit own bio", upd.rowCount === 1);
  ok("member cannot edit others", (await q("update public.profiles set bio = 'pwn' where id = $1", [alice])).rowCount === 0);
  ok("member cannot edit others' posts", (await q("update public.posts set body = 'pwn' where id = $1", [post.id])).rowCount === 0);
  ok("member cannot delete others' posts", (await q("delete from public.posts where id = $1", [post.id])).rowCount === 0);
  await rejects("member cannot forge post author", "insert into public.posts (author_id, body) values ($1, 'x')", [alice], "42501");
  await rejects("member cannot write channel counters", "update public.channels set follower_count = 999999 where id = $1", [ch.id], "42501");
  await rejects("member cannot create donations", "insert into public.donations (channel_id, amount_cents, currency) values ($1, 100, 'USD')", [ch.id], "42501");
  await rejects("member cannot read audit log", "select * from public.audit_log", [], "42501");
  ok("member can post as self", (await q("insert into public.posts (author_id, body) values ($1, 'mine')", [bob])).rowCount === 1);
  ok("member sees only own likes", (await q("select 1 from public.post_likes")).rowCount === 1);
  await reset();

  await as("authenticated", mod);
  ok("admin can delete any post", (await q("delete from public.posts where id = $1", [other.id])).rowCount === 1);
  ok("admin can handle reports", (await q("update public.reports set status = 'actioned', handled_by = $1, handled_at = now() where post_id = $2", [mod, post.id])).rowCount === 1);
  await reset();

  await as("authenticated", carol);
  await reset(); // suspend carol as the server would, then retry as her
  await q("update public.profiles set status = 'suspended' where id = $1", [carol]);
  await as("authenticated", carol);
  ok("suspended member cannot read community", (await q("select 1 from public.posts")).rowCount === 0);
  await rejects("suspended member cannot post", "insert into public.posts (author_id, body) values ($1, 'x')", [carol], "42501");
  await reset();

  await rejects("single settings row enforced", "insert into public.site_settings (id) values (false)", [], "23514");
} catch (e) {
  failures.push(`unexpected error: ${e.message}`);
} finally {
  await client.query("rollback").catch(() => {});
  const { rows } = await client.query(
    "select (select count(*) from public.profiles) p, (select count(*) from public.channels) c, (select count(*) from public.posts) po",
  );
  console.log(`rolled back; leftover rows -> profiles:${rows[0].p} channels:${rows[0].c} posts:${rows[0].po}`);
  await client.end();
}

console.log(`${passed} checks passed, ${failures.length} failed`);
for (const f of failures) console.log("  FAIL:", f);
process.exitCode = failures.length ? 1 : 0;
