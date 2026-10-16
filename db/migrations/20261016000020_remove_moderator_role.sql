-- The "moderator" role is retired: only members and admins remain.
-- Existing moderators become members; moderation powers (is_moderator() is used by RLS)
-- now belong to admins only. The enum value itself is left in place (Postgres can't drop
-- an enum value in place), but the app no longer assigns or accepts it.

update public.profiles set role = 'member' where role = 'moderator';

create or replace function public.is_moderator() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active' and p.role = 'admin'
  );
$$;
