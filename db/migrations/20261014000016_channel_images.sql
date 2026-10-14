-- Channel profile picture and cover image, uploaded by admins from the admin panel.
-- Public bucket: these images are shown on the public site, so they are served straight from
-- Storage's CDN (no signed URLs). Writes still go through the server (service role) only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('channel-images', 'channel-images', true, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Storage keys inside the channel-images bucket, e.g. channels/<uuid>.webp. Null = use the
-- generated cover (tone + scene) / the initial-letter avatar.
alter table public.channels
  add column avatar_path text check (avatar_path is null or avatar_path ~ '^channels/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  add column cover_path  text check (cover_path  is null or cover_path  ~ '^channels/[0-9a-f-]{36}\.(jpg|png|webp)$');
