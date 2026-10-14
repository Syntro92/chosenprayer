-- Giving: recurring subscriptions, donations, blessings (the thank-you messages
-- shown on a channel) and the payment-provider event log.
-- Money is integer minor units. Financial rows are never cascade-deleted with a
-- channel (ON DELETE RESTRICT): archive the channel instead.

create table public.subscriptions (
  id                        uuid primary key default gen_random_uuid(),
  channel_id                uuid not null references public.channels (id) on delete restrict,
  donor_id                  uuid references public.profiles (id) on delete set null,
  donor_email               extensions.citext,
  amount_cents              integer not null check (amount_cents > 0),
  currency                  char(3) not null check (currency ~ '^[A-Z]{3}$'),
  status                    public.subscription_status not null default 'active',
  provider                  text not null default 'stripe',
  provider_subscription_id  text unique,
  provider_customer_id      text,
  current_period_end        timestamptz,
  started_at                timestamptz not null default now(),
  canceled_at               timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index subscriptions_channel_idx on public.subscriptions (channel_id);
create index subscriptions_donor_idx   on public.subscriptions (donor_id);
create index subscriptions_active_idx  on public.subscriptions (current_period_end) where status in ('active', 'past_due');
create trigger subscriptions_set_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

create table public.donations (
  id                    uuid primary key default gen_random_uuid(),
  channel_id            uuid not null references public.channels (id) on delete restrict,
  donor_id              uuid references public.profiles (id) on delete set null,   -- null = guest checkout
  subscription_id       uuid references public.subscriptions (id) on delete set null,
  donor_name            text check (donor_name is null or char_length(donor_name) <= 80),
  donor_email           extensions.citext,                                          -- for receipts; never public
  amount_cents          integer not null check (amount_cents > 0),
  fee_cents             integer not null default 0,
  currency              char(3) not null check (currency ~ '^[A-Z]{3}$'),
  frequency             public.donation_frequency not null default 'once',
  status                public.donation_status not null default 'pending',
  source                public.donation_source not null default 'web',
  provider              text not null default 'stripe',
  provider_payment_id   text unique,
  provider_customer_id  text,
  failure_reason        text,
  paid_at               timestamptz,
  refunded_at           timestamptz,
  receipt_sent_at       timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (fee_cents >= 0 and fee_cents <= amount_cents),
  unique (id, channel_id)                                                           -- lets blessings prove they match
);
create index donations_channel_idx on public.donations (channel_id, created_at desc);
create index donations_donor_idx   on public.donations (donor_id, created_at desc);
create index donations_status_idx  on public.donations (status, created_at desc);
create index donations_created_idx on public.donations (created_at desc);
create index donations_sub_idx     on public.donations (subscription_id);
create trigger donations_set_updated_at before update on public.donations
  for each row execute function public.set_updated_at();

-- A donation may only be created against a live channel, in that channel's
-- currency, and its paid/refunded timestamps follow its status automatically.
create function public.trg_donation_guard() returns trigger
language plpgsql set search_path = ''
as $$
declare
  ch public.channels%rowtype;
begin
  if tg_op = 'INSERT' then
    select * into ch from public.channels where id = new.channel_id;
    if ch.status is distinct from 'active' then
      raise exception 'channel % is not accepting donations', new.channel_id using errcode = 'check_violation';
    end if;
    if new.currency <> ch.currency then
      raise exception 'donation currency % does not match channel currency %', new.currency, ch.currency
        using errcode = 'check_violation';
    end if;
  end if;

  if new.status = 'succeeded' and new.paid_at is null then
    new.paid_at := now();
  elsif new.status = 'refunded' and new.refunded_at is null then
    new.refunded_at := now();
  end if;
  return new;
end;
$$;
create trigger donations_guard before insert or update on public.donations
  for each row execute function public.trg_donation_guard();

-- Blessings: the optional message a supporter leaves after giving.
-- Identity is protected: the public sees them only through channel_blessings_public.
create table public.blessings (
  id            uuid primary key default gen_random_uuid(),
  donation_id   uuid not null unique,
  channel_id    uuid not null,
  author_id     uuid references public.profiles (id) on delete set null,
  display_name  text check (display_name is null or char_length(display_name) <= 80),
  is_anonymous  boolean not null default false,
  message       text not null check (char_length(btrim(message)) between 1 and 500),
  show_amount   boolean not null default false,            -- supporter opted in to show what they gave
  status        public.moderation_status not null default 'visible',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (donation_id, channel_id) references public.donations (id, channel_id) on delete cascade
);
create index blessings_channel_idx on public.blessings (channel_id, created_at desc) where status = 'visible';
create index blessings_author_idx  on public.blessings (author_id);
create trigger blessings_set_updated_at before update on public.blessings
  for each row execute function public.set_updated_at();

create function public.trg_blessing_guard() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if not exists (select 1 from public.donations where id = new.donation_id and status = 'succeeded') then
    raise exception 'a blessing can only be left on a succeeded donation' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger blessings_guard before insert on public.blessings
  for each row execute function public.trg_blessing_guard();

-- Public, privacy-safe blessing feed: anonymous supporters are masked and the
-- amount only appears when the supporter chose to show it. This view runs with
-- its owner's rights on purpose (so anon can read it without reading the tables).
create view public.channel_blessings_public as
select
  b.id,
  b.channel_id,
  case when b.is_anonymous or b.display_name is null then 'Anonymous' else b.display_name end as name,
  b.message,
  b.created_at as date,
  case when b.show_amount then d.amount_cents end as amount_cents,
  case when b.show_amount then d.currency end as currency
from public.blessings b
join public.donations d on d.id = b.donation_id
join public.channels  c on c.id = b.channel_id
where b.status = 'visible' and c.status = 'active';

-- Channel counters: supporters = distinct people with a succeeded donation,
-- raised = sum of succeeded donations, blessings = visible blessings.
create function public.refresh_channel_stats(p_channel uuid) returns void
language sql security definer set search_path = ''
as $$
  update public.channels c
  set supporter_count    = s.supporters,
      total_raised_cents = s.raised,
      blessing_count     = b.cnt
  from (
    select count(distinct coalesce(d.donor_id::text, lower(d.donor_email::text), d.id::text))::int as supporters,
           coalesce(sum(d.amount_cents), 0)::bigint as raised
    from public.donations d
    where d.channel_id = p_channel and d.status = 'succeeded'
  ) s,
  (
    select count(*)::int as cnt from public.blessings x where x.channel_id = p_channel and x.status = 'visible'
  ) b
  where c.id = p_channel;
$$;

create function public.trg_refresh_channel_stats() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.refresh_channel_stats(old.channel_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.channel_id is distinct from old.channel_id) then
    perform public.refresh_channel_stats(new.channel_id);
  end if;
  return null;
end;
$$;
create trigger donations_stats after insert or update of status, amount_cents, channel_id, donor_id or delete on public.donations
  for each row execute function public.trg_refresh_channel_stats();
create trigger blessings_stats after insert or update of status or delete on public.blessings
  for each row execute function public.trg_refresh_channel_stats();

-- Payment-provider webhook log. (provider, event_id) makes handlers idempotent:
-- insert first, and skip the event if it already exists.
create table public.payment_events (
  provider      text not null default 'stripe',
  event_id      text not null,
  type          text not null,
  payload       jsonb not null,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  error         text,
  primary key (provider, event_id)
);
create index payment_events_unprocessed_idx on public.payment_events (received_at) where processed_at is null;
