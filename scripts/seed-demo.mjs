/**
 * Loads (or removes) the DEMO channels so the site isn't empty before real channels exist.
 *
 *   npm run db:seed:demo               add / refresh the demo channels (safe to re-run)
 *   npm run db:seed:demo -- --remove   delete exactly those channels again
 *
 * Only rows with the demo handles AND no owner are ever touched, so a real channel that
 * happens to reuse a handle is left alone.
 */
import pg from "pg";
import { DEMO_CHANNELS, demoProfile } from "../db/seed/demo-channels.mjs";

const remove = process.argv.includes("--remove");
const handles = DEMO_CHANNELS.map((c) => c.handle);

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (run through npm so .env is loaded)");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query("begin");

  if (remove) {
    const res = await client.query("delete from public.channels where handle = any($1) and owner_id is null", [handles]);
    console.log(`Removed ${res.rowCount} demo channel(s).`);
  } else {
    let added = 0;
    for (const c of DEMO_CHANNELS) {
      const p = demoProfile(c);
      const existing = await client.query("select id, owner_id from public.channels where handle = $1", [c.handle]);
      if (existing.rows[0]?.owner_id) {
        console.log(`Skipping @${c.handle}: a real channel already uses it.`);
        continue;
      }
      const { rows } = await client.query(
        `insert into public.channels
           (handle, name, description, about, mission, category, cover_tone, cover_scene, status,
            featured, verified, follower_count, supporter_count, published_at, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9,$10,$11,$12,$13,$13)
         on conflict (handle) do update set
           name = excluded.name, description = excluded.description, about = excluded.about,
           mission = excluded.mission, category = excluded.category, cover_tone = excluded.cover_tone,
           cover_scene = excluded.cover_scene, status = 'active', featured = excluded.featured,
           verified = excluded.verified, follower_count = excluded.follower_count,
           supporter_count = excluded.supporter_count
         returning id`,
        [c.handle, c.name, c.description, p.about, p.mission, c.category, c.tone, c.scene,
         !!c.featured, !!c.verified, c.followers, c.supporters, c.createdAt],
      );
      const id = rows[0].id;

      // Replace links and content wholesale so re-running never duplicates them.
      await client.query("delete from public.channel_links where channel_id = $1", [id]);
      await client.query("delete from public.channel_content where channel_id = $1", [id]);
      for (const [i, l] of p.links.entries()) {
        await client.query("insert into public.channel_links (channel_id, label, href, position) values ($1,$2,$3,$4)", [id, l.label, l.href, i]);
      }
      for (const k of p.content) {
        await client.query(
          `insert into public.channel_content (channel_id, kind, title, excerpt, youtube_id, cover_tone, cover_scene, published_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [id, k.kind, k.title, k.excerpt, k.youtubeId ?? null, k.tone, k.scene, k.publishedAt],
        );
      }
      added++;
    }
    console.log(`Loaded ${added} demo channel(s). Remove them any time with: npm run db:seed:demo -- --remove`);
  }

  await client.query("commit");
} catch (e) {
  await client.query("rollback").catch(() => {});
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
