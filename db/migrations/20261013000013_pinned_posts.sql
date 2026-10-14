-- Admins can pin up to three community posts to the top of the feed.
-- Written only by the server (no column grant for authenticated, see 007_security).
alter table public.posts
  add column pinned_at timestamptz,
  add column pinned_by uuid references public.profiles (id) on delete set null;

create index posts_pinned_idx on public.posts (pinned_at desc) where pinned_at is not null and status = 'visible';
