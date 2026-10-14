-- Backend support: guest-donor access token, idempotency, rate limiting,
-- email outbox and cron bookkeeping. Everything new here is SERVER-ONLY:
-- RLS is on, no policies, no grants for anon/authenticated.

-- Guests (no account) prove they own a donation with this unguessable token, so
-- they can view its status and leave a blessing. Never exposed in public queries.
alter table public.donations
  add column public_token     text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  add column idempotency_key  text;

alter table public.donations
  add constraint donations_public_token_key unique (public_token),
  add constraint donations_idempotency_key_key unique (idempotency_key),
  add constraint donations_idempotency_key_len check (idempotency_key is null or char_length(idempotency_key) between 8 and 100);

-- Rate limiting: fixed windows. One row per (key, window).
create table public.rate_limits (
  key           text        not null,
  window_start  timestamptz not null,
  count         integer     not null default 0,
  primary key (key, window_start)
);
create index rate_limits_window_idx on public.rate_limits (window_start);

-- Registers one hit and reports whether the caller is still within the limit.
create function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, remaining integer, retry_after integer)
language plpgsql
set search_path = ''
as $$
declare
  v_start timestamptz;
  v_count integer;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'rate_limit_hit: limit and window must be positive';
  end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, v_start, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into v_count;

  allowed     := v_count <= p_limit;
  remaining   := greatest(p_limit - v_count, 0);
  retry_after := greatest(ceil(extract(epoch from (v_start + make_interval(secs => p_window_seconds) - now())))::integer, 1);
  return next;
end;
$$;

-- Email outbox: rows are written in the same transaction as the business change,
-- then delivered by a cron-driven worker (FOR UPDATE SKIP LOCKED).
create table public.email_outbox (
  id          uuid primary key default gen_random_uuid(),
  to_email    extensions.citext not null,
  template    text not null,
  payload     jsonb not null default '{}'::jsonb,
  status      text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts    integer not null default 0,
  send_after  timestamptz not null default now(),
  locked_at   timestamptz,
  sent_at     timestamptz,
  last_error  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index email_outbox_due_idx on public.email_outbox (send_after) where status = 'pending';
create trigger email_outbox_set_updated_at before update on public.email_outbox
  for each row execute function public.set_updated_at();

-- One row per scheduled job: when it last ran and how it went (admin "Site health").
create table public.cron_runs (
  job          text primary key,
  last_run_at  timestamptz not null default now(),
  last_ok      boolean not null,
  detail       text
);

-- Server-only lockdown.
alter table public.rate_limits  enable row level security;
alter table public.email_outbox enable row level security;
alter table public.cron_runs    enable row level security;
revoke all on public.rate_limits, public.email_outbox, public.cron_runs from anon, authenticated;
revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;

comment on column public.donations.public_token is 'Secret. Lets a guest donor read status / leave a blessing. Never return in public queries.';
comment on table public.rate_limits  is 'Server-only. Fixed-window counters; purge rows older than a day.';
comment on table public.email_outbox is 'Server-only. Transactional email queue.';
comment on table public.cron_runs    is 'Server-only. Last run of each scheduled job.';
