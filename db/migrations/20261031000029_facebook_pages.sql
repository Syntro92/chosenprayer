-- Channels can also be linked to a Facebook Page, the same way they link to a YouTube channel. The
-- admin enters the page id (or a page link / username); the server fetches the follower count and
-- recent posts (Graph API) and keeps them fresh from a daily cron.

alter table public.channels
  add column facebook_page_id   text unique check (facebook_page_id is null or facebook_page_id ~ '^[0-9]{5,20}$'),
  add column facebook_followers bigint check (facebook_followers is null or facebook_followers >= 0),
  add column facebook_synced_at timestamptz;

alter table public.channel_content
  add column facebook_id text check (facebook_id is null or char_length(facebook_id) <= 100);

-- One row per post per channel, so a re-sync updates rather than duplicates.
create unique index channel_content_facebook_uidx
  on public.channel_content (channel_id, facebook_id) where facebook_id is not null;
