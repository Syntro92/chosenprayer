-- Accounts an admin creates get a temporary password. This flag forces the owner to choose their
-- own before they can use the admin panel; it is cleared when they change their password.
-- No column grant for authenticated (see 007_security), so only the server can write it.
alter table public.profiles
  add column must_change_password boolean not null default false;
