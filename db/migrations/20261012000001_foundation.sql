-- Foundation: extensions, shared enum types, shared trigger helpers.
-- Conventions for the whole schema:
--   * uuid primary keys, timestamptz timestamps, snake_case names
--   * money is stored as integer minor units (cents) + ISO currency code
--   * every table in `public` has row level security enabled (see the security migration)

create extension if not exists pgcrypto  with schema extensions;
create extension if not exists citext    with schema extensions;
create extension if not exists pg_trgm   with schema extensions;

-- People -------------------------------------------------------------------
create type public.user_role      as enum ('member', 'moderator', 'admin');
create type public.account_status as enum ('active', 'suspended');

-- Channels -----------------------------------------------------------------
create type public.channel_status as enum ('pending', 'active', 'paused', 'archived');
create type public.content_kind   as enum ('reflection', 'video', 'message', 'story');
create type public.cover_tone     as enum ('cream', 'mist', 'sage', 'stone');
create type public.cover_scene    as enum ('horizon', 'hills', 'sun', 'waves');

-- Giving -------------------------------------------------------------------
create type public.donation_frequency  as enum ('once', 'monthly');
create type public.donation_status     as enum ('pending', 'succeeded', 'failed', 'refunded', 'canceled');
create type public.subscription_status as enum ('active', 'past_due', 'paused', 'canceled');
-- Where the donor came from (the admin panel groups money by acquisition source).
create type public.donation_source     as enum ('web', 'social', 'email', 'offline', 'other');

-- Community / moderation ---------------------------------------------------
create type public.moderation_status  as enum ('visible', 'removed');
create type public.attachment_kind    as enum ('image', 'file');
create type public.report_reason      as enum ('spam', 'harassment', 'inappropriate', 'other');
create type public.report_status      as enum ('open', 'dismissed', 'actioned');
create type public.notification_type  as enum ('comment', 'reply', 'like', 'blessing', 'donation', 'moderation', 'system');

-- Keeps updated_at honest on every UPDATE.
create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
