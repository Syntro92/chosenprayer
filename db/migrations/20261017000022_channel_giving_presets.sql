-- Per-channel quick-pick amounts on the Support card (Admin > Channels > edit), in whole currency units.
-- Null = the site default. At most 5, because the card shows them next to the "Custom" button.
alter table public.channels add column giving_presets integer[]
  check (giving_presets is null or (cardinality(giving_presets) between 1 and 5 and array_position(giving_presets, null) is null));
