-- Admin switch (Admin > Channels > Support settings) for the "Recent Supporters" list on channel pages.
-- On by default: the list was already showing before it became switchable.
alter table public.site_settings
  add column show_recent_supporters boolean not null default true;
