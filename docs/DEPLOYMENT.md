# Deploying to Vercel

The site, the API and the admin panel (`/admin`) are one Next.js project. Pushing to the production
branch (`main` of the GitHub repo connected to Vercel) deploys it. The admin panel is a pre-built
bundle in `public/admin`, so run `npm run admin:build` and commit the result whenever `admin/`
changes.

## 1. Environment variables (Vercel → Project → Settings → Environment Variables → Production)

Names only; copy the values from your local `.env`. Never commit values.

| Variable | Notes |
|---|---|
| `APP_URL` | `https://www.chosenprayer.com` (used for same-site checks and links; must match the real address) |
| `DATABASE_URL` | Supabase **session** pooler URL (port 5432) |
| `DATABASE_URL_POOLER` | Supabase **transaction** pooler URL (port 6543). The app uses this at runtime |
| `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only. Never expose |
| `CRON_SECRET` | 16+ random characters. Vercel Cron sends it automatically as `Authorization: Bearer …` |
| `PAYMENTS_PROVIDER` | `stripe` (the mock is refused in production) |
| `STRIPE_SECRET_KEY` | `rk_test_…`/`sk_test_…` while testing. Live keys (`…_live_…`) are only accepted in production |
| `STRIPE_PUBLISHABLE_KEY` | `pk_test_…` (matching mode) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` of the **deployed** webhook destination (not the one from `stripe listen`) |
| `EMAIL_PROVIDER` | `mailtrap` (`console` only prints emails and sends nothing) |
| `MAILTRAP_API_TOKEN`, `EMAIL_FROM`, `EMAIL_FROM_NAME` | Sending domain must be verified in Mailtrap |

Set them **before** the first production deploy, or redeploy after setting them: variables are read at
runtime, so a missing one makes pages error until the next deployment picks it up.

## 2. Stripe

Developers → Webhooks → Create destination: scope **Your account**, payload **Snapshot**, endpoint
`https://www.chosenprayer.com/api/webhooks/stripe` (use the `www` address; Stripe does not follow the
redirect from the bare domain). Events:
`payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `invoice.paid`,
`invoice.payment_failed`, `customer.subscription.deleted`.
Copy its signing secret into `STRIPE_WEBHOOK_SECRET` (Vercel) and redeploy.

Checks after deploying:

* `curl -X POST https://www.chosenprayer.com/api/webhooks/stripe` answers **400 "Missing signature"**
  (404 means the new code isn't live).
* Make a test payment (`4242 4242 4242 4242`), then confirm it under Admin → Transactions and that the
  receipt email arrived.
* Stripe → Webhooks → the destination → recent deliveries should all be `200`.

Going live later: create **live** keys and a **live** webhook destination, replace the three Stripe
variables in Production only, redeploy, and make one small real payment.

## 3. Supabase Auth

Authentication → URL Configuration: set **Site URL** to `https://www.chosenprayer.com` and add
`https://www.chosenprayer.com/**` to the redirect URLs (password-reset links come back through
`/auth/callback`).

## 4. Scheduled jobs

`vercel.json` registers three daily jobs (UTC): `/api/cron/sweep` (closes abandoned checkouts),
`/api/cron/cleanup` (old page views, counters, sent emails, orphan uploads) and `/api/cron/email`
(retries failed receipts). Receipts themselves are sent right after the payment webhook, so the email
job is only a safety net. The Hobby plan allows one run per day per job; on Pro you may run
`/api/cron/email` more often (for example `*/10 * * * *`).

## 5. Database

Migrations live in `db/migrations` and are applied with `npm run db:migrate` (they run against whichever
database `DATABASE_URL` in your local `.env` points to). Apply new migrations **before** deploying code
that needs them. Development and production currently share one Supabase project.

## 6. After the first deploy

* `https://www.chosenprayer.com/api/health` → `{"ok":true,…}`
* Sign in at `/admin` with a staff account (`npm run admin:create -- <email> --role admin` creates one).
* Admin → Site Health shows payments as "Test mode" until live keys are installed, and the scheduled
  jobs after their first run.
