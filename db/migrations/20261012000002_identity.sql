-- Identity: one `profiles` row per Supabase Auth user (auth.users).
-- Credentials, email and sessions stay in Supabase Auth; this table is the public
-- face of an account plus its platform role. Email is deliberately NOT copied here
-- so that profile reads can never leak it.

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      extensions.citext not null unique
                  check (username operator(extensions.~) '^[a-z0-9_]{3,30}$'),
  display_name  text not null check (char_length(btrim(display_name)) between 1 and 80),
  bio           text not null default '' check (char_length(bio) <= 300),
  avatar_url    text check (avatar_url is null or avatar_url ~ '^https?://'),
  avatar_tone   text not null default 'cream' check (avatar_tone in ('cream', 'bless', 'mist', 'sage', 'line')),
  locale        text not null default 'EN' check (locale ~ '^[A-Z]{2}$'),
  role          public.user_role not null default 'member',
  status        public.account_status not null default 'active',
  verified      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role) where role <> 'member';
create index profiles_created_idx on public.profiles (created_at desc);
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Role helpers used by RLS policies. SECURITY DEFINER so they can read profiles
-- without recursing into profiles' own policies.
create function public.is_active_member() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active');
$$;

create function public.is_moderator() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active' and p.role in ('moderator', 'admin')
  );
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active' and p.role = 'admin'
  );
$$;

-- Auto-create the profile when someone signs up. The sign-up form can pass
-- options.data = { full_name, username } and both are honoured; otherwise the
-- username is derived from the email and made unique.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  base      text;
  candidate text;
  tries     int := 0;
  shown     text;
begin
  base := lower(regexp_replace(
    coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), split_part(coalesce(new.email, ''), '@', 1)),
    '[^a-zA-Z0-9_]', '', 'g'));
  if char_length(base) < 3 then
    base := 'member' || base;
  end if;
  base := left(base, 24);
  candidate := base;

  while exists (select 1 from public.profiles where username = candidate::extensions.citext) loop
    tries := tries + 1;
    if tries > 25 then
      candidate := left(base, 20) || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
      exit;
    end if;
    candidate := base || (1000 + floor(random() * 9000))::int::text;
  end loop;

  shown := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    base);

  insert into public.profiles (id, username, display_name)
  values (new.id, candidate::extensions.citext, left(shown, 80));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
