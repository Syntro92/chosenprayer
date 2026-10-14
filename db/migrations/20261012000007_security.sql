-- Security: row level security on EVERY table, deny-by-default grants.
--
-- Supabase exposes the `public` schema over its REST API to the `anon` and
-- `authenticated` roles, so RLS + grants are the real access boundary there.
-- The Next.js server connects with the service role / postgres, which bypasses
-- RLS: everything that needs trust (payments, moderation, admin, counters,
-- role changes) goes through the server, never directly from the browser.

-- 1. Start from zero: strip the broad default grants, then whitelist below. -----
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Internal functions must not be callable through the REST API (/rpc).
revoke execute on function
  public.refresh_channel_stats(uuid),
  public.handle_new_user(),
  public.trg_channel_follower_count(),
  public.trg_refresh_channel_stats(),
  public.trg_post_like_count(),
  public.trg_comment_like_count(),
  public.trg_post_comment_count()
from public, anon, authenticated;

-- 2. Enable RLS everywhere. ---------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.categories        enable row level security;
alter table public.channels          enable row level security;
alter table public.channel_links     enable row level security;
alter table public.channel_content   enable row level security;
alter table public.channel_follows   enable row level security;
alter table public.subscriptions     enable row level security;
alter table public.donations         enable row level security;
alter table public.blessings         enable row level security;
alter table public.payment_events    enable row level security;
alter table public.posts             enable row level security;
alter table public.post_attachments  enable row level security;
alter table public.comments          enable row level security;
alter table public.post_likes        enable row level security;
alter table public.comment_likes     enable row level security;
alter table public.reports           enable row level security;
alter table public.notifications     enable row level security;
alter table public.site_settings     enable row level security;
alter table public.feature_flags     enable row level security;
alter table public.audit_log         enable row level security;
alter table public.page_views        enable row level security;

-- 3. Public (anon + signed-in) reads ------------------------------------------
grant select on public.categories, public.channels, public.channel_links,
                public.channel_content, public.feature_flags,
                public.channel_blessings_public
  to anon, authenticated;

create policy categories_read on public.categories for select to anon, authenticated using (true);
create policy feature_flags_read on public.feature_flags for select to anon, authenticated using (true);

create policy channels_read on public.channels for select to anon, authenticated
  using (status = 'active' or owner_id = (select auth.uid()) or (select public.is_admin()));

-- Links/content inherit channel visibility: the sub-select is itself filtered by channels_read.
create policy channel_links_read on public.channel_links for select to anon, authenticated
  using (exists (select 1 from public.channels c where c.id = channel_id));

create policy channel_content_read on public.channel_content for select to anon, authenticated
  using (published_at is not null and published_at <= now()
         and exists (select 1 from public.channels c where c.id = channel_id));

-- 4. Accounts -----------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (display_name, username, bio, avatar_url, avatar_tone, locale) on public.profiles to authenticated;
-- role / status / verified are NOT updatable by users: only the server changes them.

create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()) and (select public.is_active_member()))
  with check (id = (select auth.uid()));

grant select, insert, delete on public.channel_follows to authenticated;
create policy follows_read   on public.channel_follows for select to authenticated using (user_id = (select auth.uid()));
create policy follows_insert on public.channel_follows for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active_member())
              and exists (select 1 from public.channels c where c.id = channel_id and c.status = 'active'));
create policy follows_delete on public.channel_follows for delete to authenticated using (user_id = (select auth.uid()));

-- 5. Money: read your own, everything else is server-side only -----------------
grant select on public.donations, public.subscriptions, public.blessings to authenticated;
create policy donations_read on public.donations for select to authenticated
  using (donor_id = (select auth.uid()) or (select public.is_admin()));
create policy subscriptions_read on public.subscriptions for select to authenticated
  using (donor_id = (select auth.uid()) or (select public.is_admin()));
create policy blessings_read on public.blessings for select to authenticated
  using (author_id = (select auth.uid()) or (select public.is_moderator()));
-- Everyone else reads blessings through public.channel_blessings_public (masked).

-- 6. Community (members only) ---------------------------------------------------
grant select, delete on public.posts to authenticated;
grant insert (author_id, body) on public.posts to authenticated;
grant update (body) on public.posts to authenticated;

create policy posts_read on public.posts for select to authenticated
  using ((select public.is_active_member())
         and (status = 'visible' or author_id = (select auth.uid()) or (select public.is_moderator())));
create policy posts_insert on public.posts for insert to authenticated
  with check (author_id = (select auth.uid()) and (select public.is_active_member()));
create policy posts_update_own on public.posts for update to authenticated
  using (author_id = (select auth.uid()) and status = 'visible' and (select public.is_active_member()))
  with check (author_id = (select auth.uid()));
create policy posts_delete on public.posts for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.is_moderator()));

grant select, insert, delete on public.post_attachments to authenticated;
create policy attachments_read on public.post_attachments for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));
create policy attachments_insert on public.post_attachments for insert to authenticated
  with check (exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid())));
create policy attachments_delete on public.post_attachments for delete to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid())));

grant select, delete on public.comments to authenticated;
grant insert (post_id, parent_id, author_id, body) on public.comments to authenticated;
grant update (body) on public.comments to authenticated;

create policy comments_read on public.comments for select to authenticated
  using ((select public.is_active_member())
         and exists (select 1 from public.posts p where p.id = post_id)
         and (status = 'visible' or author_id = (select auth.uid()) or (select public.is_moderator())));
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = (select auth.uid()) and (select public.is_active_member())
              and exists (select 1 from public.posts p where p.id = post_id and p.status = 'visible'));
create policy comments_update_own on public.comments for update to authenticated
  using (author_id = (select auth.uid()) and status = 'visible' and (select public.is_active_member()))
  with check (author_id = (select auth.uid()));
create policy comments_delete on public.comments for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.is_moderator()));

grant select, insert, delete on public.post_likes, public.comment_likes to authenticated;
create policy post_likes_read on public.post_likes for select to authenticated using (user_id = (select auth.uid()));
create policy post_likes_insert on public.post_likes for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active_member())
              and exists (select 1 from public.posts p where p.id = post_id and p.status = 'visible'));
create policy post_likes_delete on public.post_likes for delete to authenticated using (user_id = (select auth.uid()));

create policy comment_likes_read on public.comment_likes for select to authenticated using (user_id = (select auth.uid()));
create policy comment_likes_insert on public.comment_likes for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active_member())
              and exists (select 1 from public.comments c where c.id = comment_id and c.status = 'visible'));
create policy comment_likes_delete on public.comment_likes for delete to authenticated using (user_id = (select auth.uid()));

grant select on public.reports to authenticated;
grant insert (post_id, comment_id, reporter_id, reason, note) on public.reports to authenticated;
grant update (status, handled_by, handled_at, resolution) on public.reports to authenticated;
create policy reports_read on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.is_moderator()));
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and (select public.is_active_member()));
create policy reports_handle on public.reports for update to authenticated
  using ((select public.is_moderator()))
  with check ((select public.is_moderator()) and handled_by = (select auth.uid()));

grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_read   on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = (select auth.uid()));

-- 7. Server-only tables ---------------------------------------------------------
-- payment_events, audit_log, page_views, site_settings: RLS on, no policies and no
-- grants, so neither anon nor authenticated can touch them. The service role can.
comment on table public.payment_events is 'Server-only. Webhook log, idempotency by (provider, event_id).';
comment on table public.audit_log      is 'Server-only. Append-only admin/moderator trail.';
comment on table public.page_views     is 'Server-only. First-party analytics.';
comment on table public.site_settings  is 'Server-only. Single row.';
comment on view  public.channel_blessings_public is
  'Intentionally runs with owner rights: exposes only masked blessing fields (anonymous names hidden, amount only if shown).';
