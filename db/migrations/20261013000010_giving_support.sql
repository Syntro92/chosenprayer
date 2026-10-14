-- Giving support: remember which provider subscription a monthly donation belongs to until the
-- first payment succeeds (that is when the subscriptions row is created), and cap amounts in the
-- database as a last line of defence (the app limit is 999,999 whole currency units).

alter table public.donations
  add column provider_subscription_id text;

create index donations_provider_sub_idx
  on public.donations (provider_subscription_id)
  where provider_subscription_id is not null;

alter table public.donations
  add constraint donations_amount_cap check (amount_cents <= 99999900);

alter table public.subscriptions
  add constraint subscriptions_amount_cap check (amount_cents <= 99999900);

-- Outbox rows are claimed (status 'sending') and may be re-claimed if a worker dies mid-send.
create index email_outbox_stuck_idx on public.email_outbox (locked_at) where status = 'sending';
