-- The admin can pin up to 3 already-synced videos/posts into the "Latest from" slots shown on the
-- channel page, in whatever order they like, instead of it always being the 3 most recent items.
alter table public.channel_content
  add column featured_position smallint check (featured_position between 1 and 3);

-- One item per slot per channel.
create unique index channel_content_featured_uidx
  on public.channel_content (channel_id, featured_position) where featured_position is not null;
