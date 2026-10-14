# Backend design — Chosen Prayer

How we build the whole backend on top of the Supabase schema that is already live
(`db/migrations/0001–0007`). Read it top to bottom once; after that use section 7
(API reference) and section 12 (build order) as the working checklist.

**Status key** used throughout: ✅ done · 🔨 build now · ⏳ designed now, finished when an outside account/key exists.

---

## 1. Scope

**What the backend must do**

| Area | Capability |
|---|---|
| Accounts | Sign up / in / out, password reset, profile editing, account deletion, roles |
| Channels | Public directory + profile, owner-managed content, follow/unfollow |
| Giving | One-time + monthly support, receipts, blessings (thank-you messages), refunds |
| Community | Members-only feed: posts, comments, replies, likes, attachments |
| Trust & safety | Reports, moderator removals, suspensions, audit trail |
| Notifications | In-app bell + email |
| Admin | Everything the admin panel needs: dashboard, channels, transactions, users, settings, analytics |
| Platform | Rate limiting, caching, analytics beacon, health checks, cron jobs |

**Deliberately waiting (⏳)** — designed in full, wired to a *mock* so the product works end-to-end today:

- **Stripe** (payments, Connect payouts, webhooks) → behind a `PaymentProvider` interface with a working `mock` implementation.
- **Transactional email provider** (e.g. Resend) → behind an `EmailSender` interface; emails are queued in an outbox table and a `console` sender prints them in dev.

Everything else gets built for real, now.

---

## 2. Architecture

```
 Browser ── Next.js site (Server Components + Server Actions)
 Browser ── Admin panel (Vue SPA at /admin) ──► /api/admin/*  (route handlers)
 Stripe / cron / beacon ───────────────────────► /api/webhooks/*, /api/cron/*, /api/track

                    ┌──────────────── src/server ────────────────┐
  actions / routes  │  services  (all business rules + authz)    │
  stay THIN  ─────► │     │            │              │          │
                    │   db.ts      providers/      auth/session  │
                    │  (pg pool)  payments, email   (Supabase)   │
                    └─────┬──────────────────────────────────────┘
                          ▼
              Supabase Postgres (schema + triggers + RLS)  ·  Supabase Auth  ·  Storage
```

**Principles**

1. **One brain: the service layer.** Every rule (who may do what, limits, state transitions) lives in `src/server/services/*`. Server Actions, route handlers and webhooks are thin adapters that parse input, call a service, shape the output. No SQL or business logic in `app/`.
2. **Explicit actor.** Every service function takes an `Actor` (`{ userId, role, status } | null`) as its first argument. Nothing reads cookies deep inside; this makes authorization visible and testable.
3. **Defence in depth.** The server connects as a privileged role (RLS bypassed), so *the service layer is the authorization boundary*. RLS (already live) is the second wall for anything that ever talks to Supabase directly from a browser.
4. **The database enforces invariants.** Limits, one-level replies, counters, currency match, "blessing needs a paid donation" are already constraints/triggers. Services still validate first for friendly errors, but correctness never depends on the app being bug-free.
5. **Money is only changed by verified provider events.** The browser can never mark a donation as paid.
6. **Idempotent everywhere money or webhooks are involved.**

---

## 3. Technology decisions

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js 16 App Router (already here) | One deploy for site + API. `proxy.ts` replaces middleware; `cacheComponents` is on. |
| Identity | **Supabase Auth** via `@supabase/ssr` (cookie sessions) | Profiles/RLS already key off `auth.users`. No password code to own. |
| Data access | `pg` pool + hand-written SQL in repository modules | Transactions, our triggers and the migration runner already use `pg`. No ORM to fight. Typed row mappers per module. |
| Validation | `zod` at every boundary | One schema → runtime check + TS type + error messages. |
| Site mutations | **Server Actions** | Built-in CSRF protection, no hand-rolled fetch layer; replaces `communityService`. |
| Admin / external | **Route Handlers** (`/api/admin/*`, webhooks, cron, track) | The Vue admin needs plain HTTP JSON; webhooks need raw bodies. |
| Files | Supabase Storage, private bucket, **signed upload/download URLs** | Server never proxies bytes; bucket already created. |
| Payments | Stripe Connect (Checkout/PaymentIntents) behind `PaymentProvider` | ⏳ — mock now. |
| Email | `EmailSender` interface + `email_outbox` table | ⏳ sender; queue is real. |
| Rate limiting | Postgres fixed-window function | No extra service; fine at this scale. |
| Jobs | Vercel Cron (or any scheduler) → `/api/cron/*` with a secret | Outbox flush, cleanups, stale-donation sweeper. |

> Next 16 facts verified against `node_modules/next/dist/docs`: `proxy.ts` (not `middleware.ts`) sits beside `app`; `GET` route handlers are *uncached by default* and, with `cacheComponents`, run at request time unless they use `use cache`; `cookies()`/`headers()` are async; Server Actions are POST-only and **must re-check auth themselves**.

### Runtime database connection

- **Migrations** use `DATABASE_URL` (session pooler, port 5432) — already working.
- **App runtime on serverless (Vercel)** should use the *transaction* pooler (port 6543) via a new `DATABASE_URL_POOLER`, pool `max` ≈ 3–5, no named prepared statements. Locally the session URL is fine.

---

## 4. Project structure

```
src/
  app/
    api/
      admin/…            route handlers for the Vue admin (JSON)
      webhooks/stripe/   ✅ raw-body webhook (signature verified)
      cron/…             secret-protected jobs
      track/             analytics beacon
      health/            liveness + DB ping
    …existing pages…
  server/
    env.ts               zod-validated environment (fails fast at boot)
    db.ts                pool, query(), tx(callback)
    errors.ts            AppError + codes → HTTP mapping
    http.ts              route helpers: handler(), json(), parse(), originCheck()
    pagination.ts        opaque keyset cursors
    rate-limit.ts        wraps the SQL function
    auth/
      supabase.ts        server/admin Supabase clients
      session.ts         getActor(), requireActor(), requireRole()
    services/            ← business logic, one file per domain
      accounts.ts  channels.ts  follows.ts  giving.ts  blessings.ts
      posts.ts  comments.ts  attachments.ts  reports.ts  moderation.ts
      notifications.ts  admin.ts  analytics.ts  settings.ts
    repos/               SQL, one module per aggregate (used only by services)
    providers/
      payments/          types.ts · mock.ts · stripe.ts ✅ · stripe-mode.ts
      email/             types.ts · console.ts · resend.ts ⏳
    jobs/                outbox flush, sweepers
  proxy.ts               cheap early gate: refresh session cookie, redirect signed-out users away from members-only routes, protect /admin
db/migrations/           ✅ schema, plus 0008 (section 8)
scripts/                 migrate · db-smoke · create-admin
```

Rule of thumb: **`app/` → `services/` → `repos/` → `db.ts`**. Imports never go upward. Mark `src/server/**` with `import "server-only"` so it can never leak into a client bundle.

---

## 5. Cross-cutting foundations (build these first)

### 5.1 Environment (`server/env.ts`)
Validate once with zod, export a typed `env`. Required now: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `APP_URL`, `CRON_SECRET`. Optional until later: `STRIPE_*`, `RESEND_API_KEY`, `PAYMENTS_PROVIDER=mock|stripe`, `EMAIL_PROVIDER=console|resend`. The service-role key and DB URLs are never `NEXT_PUBLIC_*`.

### 5.2 Authentication & session
- Sign-up/sign-in/out/reset are **Server Actions** calling Supabase Auth through `@supabase/ssr` so the session lives in httpOnly cookies on our domain (the `/admin` SPA shares it — same origin).
- Sign-up passes `options.data = { full_name, username? }`; the existing trigger `handle_new_user` creates the profile.
- `getActor()` calls `supabase.auth.getUser()` (verifies with Supabase — never trust an unverified cookie payload), then loads `profiles` for `role` + `status`. A `suspended` actor is treated as unauthenticated for writes.
- `proxy.ts` only does the cheap stuff (refresh cookies, redirect `/community/*` visitors to sign-in, bounce non-admins from `/admin`). **It is not the security boundary** — services re-check.
- Suspension = `profiles.status='suspended'` **and** Supabase admin `ban_duration` so existing sessions/logins die too.

### 5.3 Authorization
A tiny policy module, used by services only:

| Actor | Can |
|---|---|
| anonymous | read active channels/profiles/content, masked blessings; donate (guest); send analytics beacon |
| member | everything above + community read/write, follow, own profile, own donations/subscriptions, report |
| channel owner (member with `channels.owner_id`) | edit *their* channel, content, links; see its aggregate stats |
| moderator | member + remove posts/comments/blessings, handle reports |
| admin | everything, incl. users/roles, channels approval, settings, flags, refunds, audit log |

Ownership checks are explicit (`channel.owner_id === actor.userId`), never inferred from the request body.

### 5.4 Validation & errors
- Every Server Action / handler: `schema.parse(input)` first. Limits are imported from the existing `src/lib/community/config.ts` so UI and server share one source.
- `AppError(code, message, { status, fields })` with codes: `VALIDATION`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `PAYMENT_*`, `INTERNAL`.
- JSON shape for route handlers: `{ "error": { "code", "message", "fields?" } }`. Server Actions return `{ ok: true, data } | { ok: false, error }` (never throw to the UI for expected failures).
- Postgres errors are translated centrally (`23505` → `CONFLICT`, `23514` → `VALIDATION`, `42501` → `FORBIDDEN`) so trigger-raised rules surface as clean messages.

### 5.5 Pagination, ordering, idempotency
- Lists use **keyset pagination** on `(created_at, id)` with an opaque base64 cursor; `limit` capped at 50. Channel directory sorts: `popular` (`follower_count`), `newest` (`created_at`), `name`.
- Idempotency: clients send an `Idempotency-Key` for donation creation; stored in `donations.idempotency_key` (unique). Webhooks use `payment_events (provider, event_id)`.

### 5.6 Rate limiting
`rate_limit_hit(key, limit, window_seconds)` SQL function (migration 0008). Keys: `ip:<ip>:signin`, `user:<id>:post`, … Suggested limits: sign-in 10/10 min/IP · sign-up 5/hour/IP · post 10/hour/user · comment 30/hour/user · report 20/day/user · donation create 10/hour/IP · beacon 120/min/visitor. Over limit → `RATE_LIMITED` (HTTP 429, `Retry-After`).

### 5.7 Caching (Next 16 Cache Components)
- **Public, shared data** (channel directory, channel profile, categories, flags, blessings feed): service functions marked `'use cache'` + `cacheLife('minutes')` + `cacheTag('channels')`, `cacheTag('channel:<handle>')`. Mutations call `revalidateTag` (e.g. a succeeded donation revalidates `channel:<handle>`).
- **Per-user data** (community feed, notifications, "have I liked this", my donations): never cached; read `cookies()` inside `<Suspense>` so the shell stays fast.
- Route handlers stay uncached (default) except explicitly static ones.

### 5.8 Logging & health
Structured JSON logs (`level, route, actorId, requestId, code`), never log tokens/emails/payloads from webhooks. `/api/health` returns `{ ok, db }` (runs `select 1`) for uptime checks and the admin "Site health" page.

---

## 6. Domain modules — step by step

Each module lists: **rules → operations → tables → side-effects.** Table names are from the live schema.

### 6.1 Accounts & profiles 🔨
- **Rules:** username `^[a-z0-9_]{3,30}$`, unique (citext); display name 1–80; bio ≤ 300; users can't change `role/status/verified`.
- **Operations:** `signUp`, `signIn`, `signOut`, `requestPasswordReset`, `updatePassword`, `getMyProfile`, `updateMyProfile`, `getPublicMember(username)`, `deleteMyAccount`.
- **Tables:** `profiles` (+ `auth.users`).
- **Notes:** `deleteMyAccount` deletes the auth user; `ON DELETE CASCADE` removes profile, posts, comments, likes, follows, notifications. **Donations survive** with `donor_id` set null (financial record-keeping) — the schema was designed for this.
- **No email confirmation (decision, M1):** sign-up creates the account already-confirmed through the admin API and signs the user in, so it works whatever the dashboard's "Confirm email" switch says and never sends mail. Trade-off: an email isn't proven to belong to the signer. Password-reset still sends email, so set a custom SMTP before launch (the built-in mailer only reaches team addresses and is heavily rate-limited).

### 6.2 Channels — public read 🔨
- **Operations:** `listChannels({ q, category, sort, scope, cursor })`, `getChannel(handle)` (+ links, published content, blessing feed, `isFollowing` for members), `listCategories`.
- **Rules:** public sees `status='active'` only. Search uses `name ILIKE`/trigram (`channels_name_trgm_idx`) + description. "Featured" shown only when not filtering (matches current UI).
- **Maps to** `src/lib/channels.ts` types: `followers ← follower_count`, `supporters ← supporter_count`, `createdAt`, `cover.{tone,scene}`, `featured`, `verified`; profile `about/mission/links/content/blessings/blessingsCount`.
- **Cache:** tagged `channels` / `channel:<handle>`.

### 6.3 Channels — owner & admin management 🔨
- **Lifecycle:** member creates channel → `pending` → admin approves (`active`) / rejects / later `paused` or `archived`. Owner can edit description, about, mission, links, content, cover; cannot touch `status`, `featured`, `verified`, counters, `currency`, `stripe_account_id`.
- **Operations:** `createChannel`, `updateChannel`, `setChannelStatus` (admin), `setFeatured/Verified` (admin), links CRUD, content CRUD (draft = `published_at null`).
- **Rules:** handle `^[a-z0-9][a-z0-9_]{2,29}$` + a reserved-word list; `category` must exist; YouTube id is 11 chars.
- **Side-effects:** audit log for admin actions; notify owner on approval/rejection; revalidate tags.

### 6.4 Following 🔨
`followChannel`, `unfollowChannel`, `listMyFollowing`. Idempotent (`ON CONFLICT DO NOTHING`). `follower_count` is a trigger — services never write it.

### 6.5 Giving ⏳ (build against `mock`, swap to Stripe later)

**Provider interface** (`providers/payments/types.ts`):
`createCheckout(donation, channel) → { clientSecret | redirectUrl, providerRefs }` · `cancelSubscription(ref)` · `refund(paymentRef, amount?)` · `parseWebhook(rawBody, signature) → NormalizedEvent` · `createConnectAccount(channel)` / `accountStatus(...)`.
`mock` implements all of it in-process; a **dev-only** endpoint (`/api/dev/mock-pay`, 404 in production) flips a donation to succeeded/failed so the whole UX is testable.

**State machine** (`donations.status`):
```
 pending ──paid──► succeeded ──refund──► refunded
    │                                      
    ├──payment failed──► failed            (monthly: each cycle = a new donation row
    └──abandoned/expired──► canceled        linked by subscription_id)
```
Only a verified provider event (or the mock endpoint) moves a donation out of `pending`. DB triggers then fill `paid_at/refunded_at` and refresh channel stats.

**Operations**
1. `startDonation(actor|guest, { channelHandle, amount, frequency, name?, email?, source?, idempotencyKey })`
   - checks: flag `online_donations` (+ `recurring_donations` for monthly), channel `active`, amount within `[$1, $999,999]` (matches UI), currency = channel currency, rate limit, guest must give email for a receipt.
   - inserts `donations(status=pending)` with a random **`public_token`** (0008) → calls provider → returns what the browser needs to continue.
2. `handlePaymentEvent(event)` (webhook): insert into `payment_events` first (duplicate → return 200 and stop), then dispatch:
   `payment succeeded` → mark succeeded, store fee/provider ids · `payment failed` → failed + reason · `refunded` → refunded · `invoice paid` (monthly) → new donation row for the cycle · `subscription updated/deleted` → `subscriptions` status/period/cancel.
   After commit: enqueue receipt email, notify channel owner (`notifications.type='donation'`), `revalidateTag('channel:<handle>')`, mark event processed.
3. `getDonationStatus(id, token)` — success page polls it (guests authenticate by `public_token`, members by session).
4. `listMyDonations`, `cancelMySubscription`, `adminRefund` (admin only, audit-logged).
5. **Sweeper job:** `pending` older than 24 h → `canceled`.

**Connect/payouts ⏳:** channel owner onboarding stores `channels.stripe_account_id`; donations are routed to the connected account (destination charges) with an optional platform fee. A channel without a completed account can't go `active` for donations (admin sees a warning).

### 6.6 Blessings 🔨 (needs a succeeded donation — works with mock)
- `createBlessing({ donationId, token|actor, message (1–500), displayName?, anonymous, showAmount })`.
- Rules: donation must be `succeeded` (DB trigger also enforces), belong to the caller (session `donor_id` or `public_token`), one per donation (unique), blessing channel must match donation (composite FK).
- Public feed = `channel_blessings_public` view (names masked, amount only if opted in). Moderators can set a blessing `removed`.
- Side-effects: `blessing_count` (trigger), notify channel owner, revalidate `channel:<handle>`.

### 6.7 Community 🔨
**Posts** — `createPost({ body, attachments[] })`, `editPost`, `deletePost`, `listFeed(cursor)`, `getPost(id)`, `listMemberPosts(username)`.
- Body ≤ 1000; require body **or** ≥1 attachment (app rule; DB allows empty body). Author edits only their own (`edited_at` is stamped by trigger). Authors hard-delete; moderators *remove* (soft).
- Feed returns, per post: author summary, attachments with **short-lived signed URLs**, counts (from the denormalised columns), and `likedByMe` (one query for the page's ids — no N+1).

**Comments** — `addComment({ postId, body, parentId? })`, `editComment`, `deleteComment`, `listComments(postId)`. Body 1–500, replies one level deep (trigger), the post must be visible. Deleting a comment removes its replies (FK cascade).

**Likes** — `togglePostLike`, `toggleCommentLike` → `INSERT … ON CONFLICT DO NOTHING` / `DELETE`; counters by trigger. Return the new `{ liked, count }`.

**Attachments (upload flow)**
1. `requestUploadUrls(files[{name,size,mime}])` → server validates type/size/count (≤6 files, ≤4 images, ≤5 MB, allowed MIME list), returns signed upload URLs for keys `posts/<userId>/<uuid>.<ext>`.
2. Browser uploads straight to Storage.
3. `createPost` receives the storage keys; server **verifies each object exists and its real size/MIME** before inserting `post_attachments`. Orphaned uploads are removed by a cleanup job.
4. Reads: signed download URL (e.g. 1 h) generated when serving the feed.

**Content safety:** text is stored raw and rendered as text (React escapes); no HTML. Links are plain text.

### 6.8 Reports & moderation 🔨
- Member: `reportPost / reportComment({ target, reason, note ≤ 300 })` — one open report per user per target (unique index).
- Moderator: `listReports(status)`, `removePost/removeComment({ reason })` → sets `status='removed'`, `removed_by/at/reason`, closes related reports as `actioned`, notifies the author (`moderation`), writes `audit_log`. `dismissReport`.
- Admin: `suspendUser / unsuspendUser`, `setRole`. Role changes and suspensions always write `audit_log`.

### 6.9 Notifications 🔨
- Created by services (never by clients): comment on my post, reply to my comment, like (batched/de-duplicated per post/hour to avoid spam), blessing/donation received, moderation outcome, approval of my channel.
- API: `listNotifications(cursor)`, `unreadCount`, `markRead(ids|all)`, `delete`. Optional email via the outbox for blessing/donation/approval.
- Never notify yourself; skip suspended users.

### 6.10 Email outbox ⏳ (queue real, sender mocked)
- `enqueueEmail(to, template, payload, sendAfter?)` inserts into `email_outbox` **inside the same transaction** as the business change (no lost emails, no emails for rolled-back work).
- `/api/cron/email` claims rows with `FOR UPDATE SKIP LOCKED`, sends through `EmailSender`, retries with backoff, marks `sent/failed`.
- Templates: donation receipt, subscription started/failed/canceled, channel approved/rejected, moderation notice. (Auth emails — verify, reset — are sent by Supabase.)

### 6.11 Admin API ✅ (powers the Vue panel)
Replaces `admin/src/utils/helpers/fake-backend.ts` and the sample arrays in `admin/src/views/main/data.ts`. Same-origin, cookie session, every handler starts with `requireRole('admin')` (or `moderator` where noted) + origin check on non-GET.

| Admin page | Endpoint(s) | Notes |
|---|---|---|
| Login | reuse `/signin` Server Action / `POST /api/auth/signin` | then `GET /api/admin/me`; non-admins rejected |
| Dashboard | `GET /api/admin/dashboard` | totals (raised, donors, avg gift), 30-day series, top channels, recent transactions, open reports |
| Channels | `GET/POST /api/admin/channels`, `GET/PATCH …/:id`, `POST …/:id/status` | approve/pause/archive, featured, verified |
| Transactions | `GET /api/admin/transactions` (filter status/channel/date/source/q), `GET …/:id`, `POST …/:id/refund` | refund = provider call ⏳ (mock marks refunded) |
| Users | `GET /api/admin/users`, `GET …/:id`, `PATCH …/:id` (role/status/verified) | joins `auth.users` for email **server-side only** |
| Settings | `GET/PUT /api/admin/settings` | single `site_settings` row |
| Analytics | `GET /api/admin/analytics?range=` | aggregates over `page_views` + donations |
| Live visitors | `GET /api/admin/live` | `count(distinct visitor_id)` in last 5 min, top paths |
| Site health | `GET /api/admin/health` | DB ping, pending webhooks/emails backlog, last cron run |
| Moderation | `GET /api/admin/reports`, `POST …/:id/resolve` | moderators allowed |
| Audit log | `GET /api/admin/audit` | read-only |

The admin password in `.env.local` (`ADMIN_EMAIL/ADMIN_PASSWORD/ADMIN_SESSION_SECRET`) is currently unused by any code. Plan: **admins are normal accounts with `role='admin'`**; `npm run admin:create -- <email>` promotes (or creates) the first one, then those env vars are deleted.

### 6.12 Analytics, settings 🔨
- `POST /api/track` (beacon): `{ path, referrer }` + first-party `visitor_id` cookie → `page_views` (country from request headers, device from UA, bots flagged). Rate-limited; never blocks page render.
- Flags: `getFlag(key)` cached with tag `flags`; checked in services (`online_donations`, `recurring_donations`, `donor_wall`, `email_receipts`, `campaign_goals`) and returned to the UI.
- Settings: site name, contact email, default currency, notify-on-donation.

---

## 7. API reference (summary)

**Site (Server Actions + Server Component reads)** — no public URL needed:
`signUp · signIn · signOut · resetPassword · updateProfile · deleteAccount · follow/unfollow · createPost · editPost · deletePost · addComment · editComment · deleteComment · toggleLike · requestUploadUrls · report · markNotificationsRead · startDonation · createBlessing · cancelSubscription`

**HTTP endpoints**

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /api/track` | none (rate-limited) | analytics beacon |
| `GET /api/health` | none | liveness + DB |
| `GET /api/donations/:id?token=` | token or session | donation status for the success page |
| `POST /api/webhooks/stripe` | Stripe signature | ✅ payment events (raw body) |
| `POST /api/dev/mock-pay` | dev only (404 in prod) | simulate a payment outcome |
| `GET /api/cron/email` · `/sweep` · `/cleanup` | `CRON_SECRET` | outbox flush, stale donation sweep, orphan uploads / old page views / rate-limit rows |
| `/api/admin/*` | admin (moderator for reports) | see 6.11 |

---

## 8. Database follow-ups — migration `0008` ✅ applied

The current schema covers the core. These additions close the gaps this design found:

| Change | Why |
|---|---|
| `donations.public_token text unique default encode(gen_random_bytes(24),'hex')` | lets a **guest** donor view status and leave a blessing without an account |
| `donations.idempotency_key text unique` | safe retries of "start donation" |
| `rate_limits(key, window_start, count)` + `rate_limit_hit(key, limit, seconds)` | section 5.6 |
| `email_outbox(id, to_email, template, payload jsonb, status, attempts, send_after, sent_at, error)` + partial index on `status='pending'` | section 6.10 |
| `cron_runs(job, last_run_at, ok, detail)` | admin "Site health" + cron visibility |
| _(moved to M6)_ admin dashboard aggregate views/functions | built with the admin API, when the exact queries are known |

Account deletion stays a hard delete via cascade (no `deleted_at` column) by design. All new tables ship with RLS on and **no client grants** (server-only), same as `payment_events`. Each change is a new numbered migration; applied migrations are never edited (the runner enforces this).

---

## 9. Security checklist

- Secrets only in server env; `server-only` import guard; no `NEXT_PUBLIC_` for the service-role key or DB URLs. **Rotate the Supabase password/service key** that were pasted into chat/docs.
- Cookies: httpOnly, Secure, SameSite=Lax. Route handlers that mutate check `Origin`/`Host`; Server Actions get Next's built-in protection.
- Every service re-checks authentication **and** authorization (incl. ownership); Server Actions are directly POST-able, so UI hiding is never enough.
- Webhooks: verify signature on the **raw** body, store event first, idempotent handlers, no secrets in logs.
- Uploads: allow-list MIME + extension, enforce size, verify the stored object, private bucket, signed URLs only; never serve user files from our origin.
- Output: stored text is rendered as text; no `dangerouslySetInnerHTML` for user content.
- Abuse: rate limits (5.6), honeypot on sign-up; add Turnstile/hCaptcha if bots appear.
- Privacy: emails never in public queries; donor identity masked via the view; account deletion path exists; donation rows keep minimal PII.
- Headers via `next.config.ts` (CSP, `X-Content-Type-Options`, `Referrer-Policy`, frame-ancestors).
- Audit log for every admin/moderator mutation.

---

## 10. Frontend integration (replacing the mocks)

| Today | Becomes |
|---|---|
| `src/lib/channels.ts` `CHANNELS` + `getProfileData()` | `services/channels.ts` reads; types kept, data from DB |
| `src/lib/community/service.ts` (mock, "the seam") | Server Actions with the same function names/shapes → `community-provider.tsx` barely changes |
| `sample-data.ts`, `DEMO_USER`, `role` switcher, "Preview as member" | real `getActor()`; delete demo mode |
| `AuthForm` (`setNotice(true)`) | submits to sign-in/sign-up Server Actions; shows field errors |
| `SupportModal` (fake steps) | `startDonation` → provider checkout → status poll → blessing form |
| Admin `fake-backend.ts`, `data.ts` | real `/api/admin/*` via `fetch-wrapper` |

Order inside each: build the service + tests first, then flip the UI to it, then delete the mock.

---

## 11. Testing

1. **DB layer** — `npm run db:smoke` (61 checks, rolled-back transaction) — extend it with each migration.
2. **Service tests** (Vitest) — run against the real DB inside a rolled-back transaction using a `tx` test helper; assert authz (anonymous / member / owner / moderator / admin) for every operation, plus limits and state transitions.
3. **Route/Action contract tests** — input validation, error shape, 401/403/429 paths.
4. **Webhook tests** — recorded provider payload fixtures; replay the same event twice (must be a no-op); out-of-order events.
5. **E2E (Playwright, later)** — sign up → follow → post → comment; donate (mock) → blessing appears.
6. **Staging** — create a second Supabase project (`donation-staging`) before launch; CI applies migrations to it and runs the suite.

---

## 12. Build order (milestones)

Each milestone is shippable and ends with tests green + UI wired + mock removed.

| # | Milestone | Contents | Depends on |
|---|---|---|---|
| **M0** ✅ | Foundations | `env.ts`, `db.ts`, errors/http helpers, Supabase clients, `getActor`, `proxy.ts`, migration **0008**, `/api/health` | Supabase **anon key** (see §13) |
| **M1** ✅ | Accounts | Sign-up/in/out/reset actions, profile edit, account delete, `admin:create` script, wire `AuthForm` | M0 |
| **M2** ✅ | Channels (read) + follow | Directory, search/filter/sort, profile, categories, follow; caching + tags; wire pages; seed real channels via admin later | M0 |
| **M3** ✅ | Community core | Posts, comments, likes, upload flow, notifications (basic); wire provider; remove demo mode | M1 |
| **M4** ✅ | Moderation | Reports, removals, suspensions, audit log, moderator queue API | M3 |
| **M5** ✅ | Giving on **mock** | `startDonation`, mock provider + dev endpoint, state machine, blessings, outbox + console emails, subscription model, sweeper | M2 |
| **M6** ✅ | Admin API | All of 6.11; replace admin fake backend; channel create/approve flow | M2, M4, M5 |
| **M7** ✅ | Analytics & hardening | Beacon, live visitors, dashboard series, cron routes, rate limits everywhere, security headers, logging | M6 |
| **M8** ✅ (sandbox) | **Stripe go-live** | ✅ `stripe.ts` adapter (card-only PaymentIntents + subscriptions), signed webhook route, Stripe Elements card form, refunds/cancel via Stripe, test/live key safety, live sandbox test (`tests/live`) · ⏳ Connect payouts, live-mode checklist (live keys + live webhook endpoint in production env) | Stripe sandbox keys ✅ |

M8 should be a *small* milestone because M5 already exercised the entire flow through the same interface.

---

## 13. What we need from you

| Needed | For | When |
|---|---|---|
| Supabase **anon / publishable key** (Dashboard → Project Settings → API) | cookie-based auth in the browser/server | start of M0 |
| Decision: **Supabase Auth** (recommended) vs. own auth | foundation of M1 | now |
| Auth settings in Supabase: redirect URLs, SMTP provider (email confirmation is no longer used) | password-reset emails | before launch |
| Currency policy: single (USD) for launch? | schema supports per-channel currency; stats assume one per channel | now |
| Min/max donation + platform fee % | `startDonation` validation, Connect | M5 |
| Who can create a channel: any member (→ approval) or admin-only? | 6.3 | M2/M6 |
| Stripe account + Connect enabled, email provider account | M8 | later |
| Staging Supabase project | tests/CI | before launch |

## 14. Open questions

1. Are community posts visible to **all signed-in members** (assumed, per the members-only UI) or only members who donated/follow?
2. Should guests be allowed to donate without an account (assumed **yes**, email required for receipt)?
3. Platform fee on donations: none, fixed %, or Stripe fees passed to the donor?
4. Do channel owners need to see *who* supported them (names/emails), or only counts + blessings (assumed counts + blessings — more private)?
5. Languages: footer lists 7 locales — is server-side content translation in scope, or UI strings only?
