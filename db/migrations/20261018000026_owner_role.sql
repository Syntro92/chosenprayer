-- New top-level role: "owner". Owners have every admin power, can't be suspended or deleted,
-- and can only be edited by other owners. The value is added on its own because Postgres
-- won't let a new enum value be used in the transaction that creates it (next migration).

alter type public.user_role add value if not exists 'owner';
