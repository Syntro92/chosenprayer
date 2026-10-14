-- Feature Management was removed from the admin panel. The three flags the giving code read
-- (online donations, recurring donations, email receipts) are now always on, which matches
-- how they were seeded. Past audit_log rows with entity_type 'flag' are kept as history.
drop table public.feature_flags;
