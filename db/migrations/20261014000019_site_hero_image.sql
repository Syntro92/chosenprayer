-- Landing-page cover image, chosen by an admin in Admin > Settings.
-- Stored in the public channel-images bucket under hero/<uuid>.<ext>. Null = the built-in default hero.
alter table public.site_settings
  add column hero_image_path text
    check (hero_image_path is null or hero_image_path ~ '^hero/[0-9a-f-]{36}\.(jpg|png|webp)$');
