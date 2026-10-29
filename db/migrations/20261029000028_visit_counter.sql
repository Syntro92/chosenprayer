-- Saved visitor count for Admin > Live Visitors. Kept apart from page_views (which the cleanup
-- cron trims) so the totals only go back to zero when an admin presses "Clear count".
create table public.visit_counter (
  id          boolean primary key default true check (id),   -- single row
  views       bigint not null default 0,
  visitors    bigint not null default 0,
  since       timestamptz not null default now(),
  cleared_by  uuid references public.profiles (id) on delete set null
);

-- Visitors already counted since the last clear, so a returning visitor is counted once.
create table public.visit_counter_visitors (
  visitor_id  uuid primary key
);

-- Start from the page views we still have, so the counter isn't empty on day one.
insert into public.visit_counter_visitors (visitor_id)
  select distinct visitor_id from public.page_views where coalesce(device, '') <> 'bot';
insert into public.visit_counter (views, visitors, since)
  select count(*), count(distinct visitor_id), coalesce(min(created_at), now())
  from public.page_views where coalesce(device, '') <> 'bot';

alter table public.visit_counter          enable row level security;
alter table public.visit_counter_visitors enable row level security;
comment on table public.visit_counter          is 'Server-only. Single row: saved visit totals since the last admin clear.';
comment on table public.visit_counter_visitors is 'Server-only. Visitor ids already counted in visit_counter.';
