-- Link to the payment provider's hosted receipt page (Stripe's "download receipt" page), shown in
-- the receipt email, the donor's account and the admin transaction page.
alter table public.donations
  add column receipt_url text
  check (receipt_url is null or (receipt_url ~ '^https://([a-z0-9-]+\.)*stripe\.com/' and char_length(receipt_url) <= 500));

comment on column public.donations.receipt_url is 'Provider-hosted receipt page (https on *.stripe.com only). Null for the mock provider.';
