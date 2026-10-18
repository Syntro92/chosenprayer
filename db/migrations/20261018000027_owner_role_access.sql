-- Owners keep every admin permission in RLS.
create or replace function public.is_moderator() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active' and p.role in ('admin', 'owner')
  );
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active' and p.role in ('admin', 'owner')
  );
$$;

-- An owner can't be deleted (not even through auth.users cascade) while the account exists.
create or replace function public.protect_owner_profile() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.role = 'owner' then
      raise exception 'An owner account cannot be deleted.' using errcode = '42501';
    end if;
    return old;
  end if;
  if old.role = 'owner' and new.status <> 'active' then
    raise exception 'An owner account cannot be suspended.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_owner before update or delete on public.profiles
  for each row execute function public.protect_owner_profile();

-- madhuwanthak@gmail.com (chosenprayer) becomes the owner.
update public.profiles set role = 'owner'
where id = (select id from auth.users where lower(email) = 'madhuwanthak@gmail.com');
