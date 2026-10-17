-- The Support card can now show up to nine quick-pick amounts (two rows on desktop), up from five.
-- The old check on site_settings.giving_presets was created inline, so find it by what it checks.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.site_settings'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%giving_presets%'
  loop
    execute format('alter table public.site_settings drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.site_settings
  add constraint site_settings_giving_presets_check
  check (cardinality(giving_presets) between 1 and 9 and array_position(giving_presets, null) is null);
