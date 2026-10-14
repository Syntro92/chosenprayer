-- Channels: the creators people support. Mirrors src/lib/channels.ts.

create table public.categories (
  slug        text primary key check (slug ~ '^[a-z0-9-]+$'),
  name        text not null unique,
  position    smallint not null default 0,
  created_at  timestamptz not null default now()
);

create table public.channels (
  id                  uuid primary key default gen_random_uuid(),
  handle              extensions.citext not null unique
                        check (handle operator(extensions.~) '^[a-z0-9][a-z0-9_]{2,29}$'),   -- route slug, no leading @
  owner_id            uuid references public.profiles (id) on delete set null,
  name                text not null check (char_length(btrim(name)) between 1 and 80),
  description         text not null default '' check (char_length(description) <= 200),   -- one-line card summary
  about               text[] not null default '{}',                                      -- profile paragraphs, in order
  mission             text not null default '' check (char_length(mission) <= 600),
  category            text not null references public.categories (slug) on update cascade,
  cover_tone          public.cover_tone  not null default 'cream',
  cover_scene         public.cover_scene not null default 'horizon',
  status              public.channel_status not null default 'pending',
  featured            boolean not null default false,
  verified            boolean not null default false,
  currency            char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  stripe_account_id   text unique,                       -- connected account that receives payouts
  -- Denormalised counters, maintained by triggers (never write these from the app).
  follower_count      integer not null default 0 check (follower_count >= 0),
  supporter_count     integer not null default 0 check (supporter_count >= 0),
  blessing_count      integer not null default 0 check (blessing_count >= 0),
  total_raised_cents  bigint  not null default 0 check (total_raised_cents >= 0),
  published_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index channels_listing_idx     on public.channels (status, category);
create index channels_popular_idx     on public.channels (follower_count desc) where status = 'active';
create index channels_newest_idx      on public.channels (created_at desc)     where status = 'active';
create index channels_featured_idx    on public.channels (featured)            where status = 'active' and featured;
create index channels_owner_idx       on public.channels (owner_id);
create index channels_name_trgm_idx   on public.channels using gin (name extensions.gin_trgm_ops);
create trigger channels_set_updated_at before update on public.channels
  for each row execute function public.set_updated_at();

-- Social / website links shown on the profile.
create table public.channel_links (
  id          uuid primary key default gen_random_uuid(),
  channel_id  uuid not null references public.channels (id) on delete cascade,
  label       text not null check (char_length(btrim(label)) between 1 and 40),
  href        text not null check (href ~ '^https?://'),
  position    smallint not null default 0,
  created_at  timestamptz not null default now()
);
create index channel_links_channel_idx on public.channel_links (channel_id, position);

-- Reflections, videos, messages and stories published on a channel.
create table public.channel_content (
  id            uuid primary key default gen_random_uuid(),
  channel_id    uuid not null references public.channels (id) on delete cascade,
  kind          public.content_kind not null default 'reflection',
  title         text not null check (char_length(btrim(title)) between 1 and 140),
  excerpt       text not null default '' check (char_length(excerpt) <= 300),
  body          text,
  youtube_id    text check (youtube_id is null or youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  cover_tone    public.cover_tone  not null default 'cream',
  cover_scene   public.cover_scene not null default 'sun',
  published_at  timestamptz,                       -- null = draft
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index channel_content_feed_idx on public.channel_content (channel_id, published_at desc) where published_at is not null;
create trigger channel_content_set_updated_at before update on public.channel_content
  for each row execute function public.set_updated_at();

create table public.channel_follows (
  channel_id  uuid not null references public.channels (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (channel_id, user_id)
);
create index channel_follows_user_idx on public.channel_follows (user_id);

-- follower_count upkeep
create function public.trg_channel_follower_count() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.channels set follower_count = follower_count + 1 where id = new.channel_id;
  else
    update public.channels set follower_count = greatest(follower_count - 1, 0) where id = old.channel_id;
  end if;
  return null;
end;
$$;
create trigger channel_follows_count after insert or delete on public.channel_follows
  for each row execute function public.trg_channel_follower_count();
