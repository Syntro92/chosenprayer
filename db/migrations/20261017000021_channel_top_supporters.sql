-- Per-channel switch (Admin > Channels > edit): show a "Top Supporters" list on the channel's public page.
-- Off by default: turning it on publishes supporter names and totals, so an admin opts each channel in.
alter table public.channels add column show_top_supporters boolean not null default false;
