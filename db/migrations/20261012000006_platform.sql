-- Platform: admin-managed settings, feature flags, audit trail, analytics,
-- the private storage bucket and reference data.

-- Single-row site settings (Admin > Settings).
create table public.site_settings (
  id                 boolean primary key default true check (id),     -- forces exactly one row
  site_name          text not null default 'Chosen Prayer' check (char_length(site_name) between 1 and 80),
  contact_email      extensions.citext,
  default_currency   char(3) not null default 'USD' check (default_currency ~ '^[A-Z]{3}$'),
  notify_on_donation boolean not null default true,
  updated_by         uuid references public.profiles (id) on delete set null,
  updated_at         timestamptz not null default now()
);
create trigger site_settings_set_updated_at before update on public.site_settings
  for each row execute function public.set_updated_at();

-- Admin > Feature Management. `key` is what code checks; name/description are for humans.
create table public.feature_flags (
  key          text primary key check (key ~ '^[a-z0-9_]+$'),
  name         text not null,
  description  text not null default '',
  enabled      boolean not null default false,
  updated_by   uuid references public.profiles (id) on delete set null,
  updated_at   timestamptz not null default now()
);
create trigger feature_flags_set_updated_at before update on public.feature_flags
  for each row execute function public.set_updated_at();

-- Append-only trail of admin / moderator actions.
create table public.audit_log (
  id           bigint generated always as identity primary key,
  actor_id     uuid references public.profiles (id) on delete set null,
  action       text not null,                    -- e.g. 'channel.approve', 'post.remove', 'user.suspend'
  entity_type  text not null,
  entity_id    text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index audit_log_entity_idx  on public.audit_log (entity_type, entity_id);
create index audit_log_actor_idx   on public.audit_log (actor_id, created_at desc);
create index audit_log_created_idx on public.audit_log (created_at desc);

-- First-party page views for Admin > Analytics and Live Visitors
-- ("live" = distinct visitor_id in the last few minutes).
create table public.page_views (
  id          bigint generated always as identity primary key,
  visitor_id  uuid not null,                     -- anonymous id from a first-party cookie
  user_id     uuid references public.profiles (id) on delete set null,
  channel_id  uuid references public.channels (id) on delete set null,
  path        text not null check (char_length(path) <= 500),
  referrer    text check (referrer is null or char_length(referrer) <= 500),
  country     char(2),
  device      text check (device in ('desktop', 'mobile', 'tablet', 'bot')),
  created_at  timestamptz not null default now()
);
create index page_views_created_idx on public.page_views (created_at desc);
create index page_views_visitor_idx on public.page_views (visitor_id, created_at desc);
create index page_views_channel_idx on public.page_views (channel_id, created_at desc) where channel_id is not null;

-- Private bucket for community attachments: no client policies are defined, so
-- only the server (service role) reads/writes and hands out short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'community-attachments', 'community-attachments', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/plain',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Reference data -----------------------------------------------------------
insert into public.categories (slug, name, position) values
  ('inspiration', 'Inspiration', 1),
  ('education',   'Education',   2),
  ('faith',       'Faith',       3),
  ('community',   'Community',   4),
  ('creativity',  'Creativity',  5),
  ('wellness',    'Wellness',    6),
  ('music',       'Music',       7),
  ('other',       'Other',       8);

insert into public.feature_flags (key, name, description, enabled) values
  ('online_donations',    'Online donations',    'Accept donations on the website',        true),
  ('recurring_donations', 'Recurring donations', 'Let donors give monthly',               true),
  ('donor_wall',          'Donor wall',          'Show recent donors publicly',           false),
  ('email_receipts',      'Email receipts',      'Send receipts after each donation',     true),
  ('campaign_goals',      'Campaign goals',      'Show progress bars on channels',        false);

insert into public.site_settings (id) values (true);
