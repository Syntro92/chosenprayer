-- Facebook posts don't have a stable, reconstructable thumbnail/link the way a YouTube video id does
-- (its photo URL is a signed, expiring Graph API field), so store what the API gave us at sync time.
-- The daily Facebook cron keeps these refreshed.

alter table public.channel_content
  add column facebook_image_url     text,
  add column facebook_permalink_url text check (facebook_permalink_url is null or facebook_permalink_url ~ '^https://');
