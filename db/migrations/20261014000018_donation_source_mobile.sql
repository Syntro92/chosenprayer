-- Donations made from a phone/tablet browser are recorded as 'mobile' instead of 'web'.
alter type public.donation_source add value if not exists 'mobile';
