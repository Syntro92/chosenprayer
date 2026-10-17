-- Support settings are site-wide (Admin > Channels > "Support settings"), not per channel:
-- the quick-pick amounts on the Support card, the minimum donation, and the Top Supporters list.
-- Replaces the per-channel columns added in 021/022.
alter table public.channels
  drop column show_top_supporters,
  drop column giving_presets;

alter table public.site_settings
  add column min_donation        integer   not null default 25 check (min_donation between 1 and 999999),
  add column giving_presets      integer[] not null default '{25,55,111,555,999}'
    check (cardinality(giving_presets) between 1 and 5 and array_position(giving_presets, null) is null),
  add column show_top_supporters boolean   not null default false;
