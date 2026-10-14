-- Channels can be linked to a YouTube channel. The admin enters the channel id; the server fetches
-- the subscriber count and recent uploads (YouTube Data API) and keeps them fresh from a daily cron.

alter table public.channels
  add column youtube_channel_id  text unique check (youtube_channel_id is null or youtube_channel_id ~ '^UC[A-Za-z0-9_-]{22}$'),
  add column youtube_subscribers bigint check (youtube_subscribers is null or youtube_subscribers >= 0),   -- null = hidden by the owner
  add column youtube_synced_at   timestamptz;

-- One row per video per channel, so a re-sync updates rather than duplicates.
create unique index channel_content_youtube_uidx
  on public.channel_content (channel_id, youtube_id) where youtube_id is not null;
