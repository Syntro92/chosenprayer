import "server-only";
import { analyticsQuerySchema, RANGES } from "@/lib/schemas/admin";
import { requireRole, type Actor } from "../auth/policy";
import { db, one, rows, type Queryable } from "../db";
import { countOpenReports } from "./moderation";
import { listAdminTransactions, type AdminTransaction } from "./admin-transactions";

/**
 * "Raised" = money currently kept: succeeded donations (refunded ones don't count).
 * Totals are summed per currency-agnostic cents; the site runs in one default currency today.
 */
const KEPT = "d.status = 'succeeded'";

export interface Dashboard {
  currency: string;
  totals: { raisedCents: number; donations: number; donors: number; averageCents: number; refundedCents: number; activeChannels: number; pendingChannels: number; members: number };
  /** Last 30 days, one entry per day (zeros filled in). */
  series: { date: string; amountCents: number; donations: number }[];
  topChannels: { handle: string; name: string; raisedCents: number; donations: number }[];
  recentTransactions: AdminTransaction[];
  openReports: number;
  pendingApprovals: number;
  /** Calendar month to date versus the whole previous month. */
  month: { raisedCents: number; previousCents: number; donors: number; previousDonors: number };
  breakdown: { onceCents: number; monthlyCents: number };
  /** Newest first: gifts, blessings and new members. */
  activity: { kind: "support" | "blessing" | "supporter"; title: string; channel: string | null; at: string }[];
}

export async function getDashboard(actor: Actor | null, conn: Queryable = db): Promise<Dashboard> {
  const a = requireRole(actor, "admin");
  const totals = (await one<{
    raised: number; donations: number; donors: number; refunded: number; active: number; pending: number; members: number; currency: string;
  }>(
    `select coalesce(sum(d.amount_cents) filter (where ${KEPT}), 0)::bigint as raised,
            count(*) filter (where ${KEPT})::int as donations,
            count(distinct coalesce(d.donor_id::text, lower(d.donor_email::text))) filter (where ${KEPT})::int as donors,
            coalesce(sum(d.amount_cents) filter (where d.status = 'refunded'), 0)::bigint as refunded,
            (select count(*)::int from public.channels where status = 'active') as active,
            (select count(*)::int from public.channels where status = 'pending') as pending,
            (select count(*)::int from public.profiles) as members,
            (select default_currency::text from public.site_settings where id) as currency
     from public.donations d`,
    [],
    conn,
  ))!;
  const series = await rows<{ date: string; amount: number; donations: number }>(
    `select to_char(day, 'YYYY-MM-DD') as date,
            coalesce(sum(d.amount_cents), 0)::bigint as amount, count(d.id)::int as donations
     from generate_series(current_date - 29, current_date, interval '1 day') day
     left join public.donations d on d.status = 'succeeded' and d.paid_at >= day and d.paid_at < day + interval '1 day'
     group by day order by day`,
    [],
    conn,
  );
  const top = await rows<{ handle: string; name: string; raised: number; donations: number }>(
    `select c.handle::text as handle, c.name, coalesce(sum(d.amount_cents), 0)::bigint as raised, count(d.id)::int as donations
     from public.channels c join public.donations d on d.channel_id = c.id and d.status = 'succeeded'
     group by c.id order by raised desc, c.name limit 5`,
    [],
    conn,
  );
  const recent = (await listAdminTransactions(a, { pageSize: 8 }, conn)).items;
  const m = (await one<{ raised: number; prev: number; donors: number; prev_donors: number; once: number; monthly: number }>(
    `select coalesce(sum(d.amount_cents) filter (where d.paid_at >= date_trunc('month', now())), 0)::bigint as raised,
            coalesce(sum(d.amount_cents) filter (where d.paid_at >= date_trunc('month', now()) - interval '1 month' and d.paid_at < date_trunc('month', now())), 0)::bigint as prev,
            count(distinct coalesce(d.donor_id::text, lower(d.donor_email::text))) filter (where d.paid_at >= date_trunc('month', now()))::int as donors,
            count(distinct coalesce(d.donor_id::text, lower(d.donor_email::text))) filter (where d.paid_at >= date_trunc('month', now()) - interval '1 month' and d.paid_at < date_trunc('month', now()))::int as prev_donors,
            coalesce(sum(d.amount_cents) filter (where d.frequency = 'once'), 0)::bigint as once,
            coalesce(sum(d.amount_cents) filter (where d.frequency = 'monthly'), 0)::bigint as monthly
     from public.donations d where ${KEPT}`,
    [],
    conn,
  ))!;
  const activity = await rows<{ kind: "support" | "blessing" | "supporter"; title: string; channel: string | null; at: string }>(
    `select * from (
       select 'support' as kind, 'New ' || to_char(d.amount_cents / 100.0, 'FM$999,999,990.00') || ' support received' as title, c.name as channel, d.paid_at as at
         from public.donations d join public.channels c on c.id = d.channel_id where d.status = 'succeeded' and d.paid_at is not null
       union all
       select 'blessing', 'New blessing received', c.name, b.created_at
         from public.blessings b join public.channels c on c.id = b.channel_id
       union all
       select 'supporter', 'New member joined', null, p.created_at from public.profiles p
     ) x order by at desc limit 8`,
    [],
    conn,
  );
  return {
    currency: totals.currency ?? "USD",
    totals: {
      raisedCents: totals.raised,
      donations: totals.donations,
      donors: totals.donors,
      averageCents: totals.donations ? Math.round(totals.raised / totals.donations) : 0,
      refundedCents: totals.refunded,
      activeChannels: totals.active,
      pendingChannels: totals.pending,
      members: totals.members,
    },
    series: series.map((s) => ({ date: s.date, amountCents: s.amount, donations: s.donations })),
    topChannels: top.map((t) => ({ handle: t.handle, name: t.name, raisedCents: t.raised, donations: t.donations })),
    recentTransactions: recent,
    openReports: await countOpenReports(a, conn),
    pendingApprovals: totals.pending,
    month: { raisedCents: m.raised, previousCents: m.prev, donors: m.donors, previousDonors: m.prev_donors },
    breakdown: { onceCents: m.once, monthlyCents: m.monthly },
    activity: activity.map((x) => ({ kind: x.kind, title: x.title, channel: x.channel, at: new Date(x.at).toISOString() })),
  };
}

export interface Analytics {
  range: string;
  days: number;
  traffic: { views: number; visitors: number; viewsSeries: { date: string; views: number; visitors: number }[] };
  topPages: { path: string; views: number }[];
  topReferrers: { referrer: string; views: number }[];
  devices: { device: string; views: number }[];
  countries: { country: string; views: number }[];
  giving: { raisedCents: number; donations: number; averageCents: number; series: { date: string; amountCents: number; donations: number }[] };
  /** donations / distinct visitors in the range; null when there is no traffic data yet. */
  conversionRate: number | null;
}

export async function getAnalytics(actor: Actor | null, raw: unknown, conn: Queryable = db): Promise<Analytics> {
  requireRole(actor, "admin");
  const { range } = analyticsQuerySchema.parse(raw);
  const days = RANGES[range];
  const since = `current_date - ${days - 1}`;

  const traffic = (await one<{ views: number; visitors: number }>(
    `select count(*)::int as views, count(distinct visitor_id)::int as visitors
     from public.page_views where created_at >= ${since} and coalesce(device, '') <> 'bot'`,
    [],
    conn,
  ))!;
  const viewsSeries = await rows<{ date: string; views: number; visitors: number }>(
    `select to_char(day, 'YYYY-MM-DD') as date, count(v.id)::int as views, count(distinct v.visitor_id)::int as visitors
     from generate_series(${since}, current_date, interval '1 day') day
     left join public.page_views v on v.created_at >= day and v.created_at < day + interval '1 day' and coalesce(v.device, '') <> 'bot'
     group by day order by day`,
    [],
    conn,
  );
  const group = (col: string, alias: string, limit = 8) =>
    rows<{ k: string; views: number }>(
      `select coalesce(nullif(${col}, ''), '(none)') as k, count(*)::int as views
       from public.page_views where created_at >= ${since} and coalesce(device, '') <> 'bot'
       group by 1 order by views desc, k limit ${limit}`,
      [],
      conn,
    ).then((r) => r.map((x) => ({ [alias]: x.k, views: x.views })));
  const [pages, referrers, devices, countries] = await Promise.all([
    group("path", "path"),
    group("referrer", "referrer"),
    group("device", "device", 4),
    group("country", "country"),
  ]);

  const giving = (await one<{ raised: number; donations: number }>(
    `select coalesce(sum(d.amount_cents), 0)::bigint as raised, count(*)::int as donations
     from public.donations d where ${KEPT} and d.paid_at >= ${since}`,
    [],
    conn,
  ))!;
  const givingSeries = await rows<{ date: string; amount: number; donations: number }>(
    `select to_char(day, 'YYYY-MM-DD') as date, coalesce(sum(d.amount_cents), 0)::bigint as amount, count(d.id)::int as donations
     from generate_series(${since}, current_date, interval '1 day') day
     left join public.donations d on d.status = 'succeeded' and d.paid_at >= day and d.paid_at < day + interval '1 day'
     group by day order by day`,
    [],
    conn,
  );

  return {
    range,
    days,
    traffic: { views: traffic.views, visitors: traffic.visitors, viewsSeries },
    topPages: pages as Analytics["topPages"],
    topReferrers: referrers as Analytics["topReferrers"],
    devices: devices as Analytics["devices"],
    countries: countries as Analytics["countries"],
    giving: {
      raisedCents: giving.raised,
      donations: giving.donations,
      averageCents: giving.donations ? Math.round(giving.raised / giving.donations) : 0,
      series: givingSeries.map((s) => ({ date: s.date, amountCents: s.amount, donations: s.donations })),
    },
    conversionRate: traffic.visitors ? Math.round((giving.donations / traffic.visitors) * 1000) / 10 : null,
  };
}

export interface LiveVisitors {
  windowMinutes: number;
  online: number;
  visitors: { visitor: string; path: string; country: string | null; device: string | null; lastSeen: string; pages: number }[];
  topPaths: { path: string; visitors: number }[];
  /** Distinct visitors per hour for the last 24 hours, oldest first (24 entries). */
  hourly: number[];
}

/** "Online now" = distinct visitors who loaded a page in the last 5 minutes. Visitor ids are shortened for display. */
export async function getLiveVisitors(actor: Actor | null, conn: Queryable = db): Promise<LiveVisitors> {
  requireRole(actor, "admin");
  const WINDOW = 5;
  const list = await rows<{ visitor: string; path: string; country: string | null; device: string | null; last_seen: string; pages: number }>(
    `select distinct on (visitor_id) left(visitor_id::text, 8) as visitor, path, country::text as country, device,
            created_at::text as last_seen,
            (select count(*)::int from public.page_views x where x.visitor_id = v.visitor_id and x.created_at > now() - make_interval(mins => $1)) as pages
     from public.page_views v
     where created_at > now() - make_interval(mins => $1) and coalesce(device, '') <> 'bot'
     order by visitor_id, created_at desc`,
    [WINDOW],
    conn,
  );
  list.sort((a, b) => b.last_seen.localeCompare(a.last_seen));
  const hourly = await rows<{ n: number }>(
    `select count(distinct v.visitor_id)::int as n
     from generate_series(date_trunc('hour', now()) - interval '23 hours', date_trunc('hour', now()), interval '1 hour') h
     left join public.page_views v on v.created_at >= h and v.created_at < h + interval '1 hour' and coalesce(v.device, '') <> 'bot'
     group by h order by h`,
    [],
    conn,
  );
  const paths = new Map<string, number>();
  for (const v of list) paths.set(v.path, (paths.get(v.path) ?? 0) + 1);
  return {
    windowMinutes: WINDOW,
    online: list.length,
    visitors: list.slice(0, 50).map((v) => ({ visitor: v.visitor, path: v.path, country: v.country, device: v.device, lastSeen: new Date(v.last_seen).toISOString(), pages: v.pages })),
    topPaths: [...paths.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([path, visitors]) => ({ path, visitors })),
    hourly: hourly.map((h) => h.n),
  };
}

export interface Health {
  ok: boolean;
  checks: {
    database: { ok: boolean; ms: number };
    payments: { ok: boolean; provider: string; testMode: boolean; detail: string };
    email: { ok: boolean; pending: number; failed: number; oldestPendingMinutes: number | null };
    webhooks: { ok: boolean; eventsLastDay: number; lastEventAt: string | null };
  };
  cron: { job: string; lastRunAt: string; ok: boolean; detail: string | null; stale: boolean }[];
}

const CRON_JOBS = [
  { job: "email", maxMinutes: 15 },
  { job: "sweep", maxMinutes: 24 * 60 },
  { job: "cleanup", maxMinutes: 36 * 60 },
];

export async function getHealth(actor: Actor | null, provider: { name: string; testMode: boolean }, conn: Queryable = db): Promise<Health> {
  requireRole(actor, "admin");
  const started = Date.now();
  let dbOk = true;
  try {
    await conn.query("select 1");
  } catch {
    dbOk = false;
  }
  const ms = Date.now() - started;
  if (!dbOk) {
    return {
      ok: false,
      checks: {
        database: { ok: false, ms },
        payments: { ok: false, provider: provider.name, testMode: provider.testMode, detail: "Unknown (database down)" },
        email: { ok: false, pending: 0, failed: 0, oldestPendingMinutes: null },
        webhooks: { ok: false, eventsLastDay: 0, lastEventAt: null },
      },
      cron: [],
    };
  }

  const mail = (await one<{ pending: number; failed: number; oldest: number | null }>(
    `select count(*) filter (where status in ('pending','sending'))::int as pending,
            count(*) filter (where status = 'failed')::int as failed,
            (extract(epoch from now() - min(send_after) filter (where status = 'pending' and send_after <= now())) / 60)::int as oldest
     from public.email_outbox`,
    [],
    conn,
  ))!;
  const hooks = (await one<{ n: number; last: string | null }>(
    "select count(*) filter (where received_at > now() - interval '1 day')::int as n, max(received_at)::text as last from public.payment_events",
    [],
    conn,
  ))!;
  const runs = await rows<{ job: string; last_run_at: string; last_ok: boolean; detail: string | null }>(
    "select job, last_run_at::text as last_run_at, last_ok, detail from public.cron_runs",
    [],
    conn,
  );

  const cron = CRON_JOBS.map(({ job, maxMinutes }) => {
    const r = runs.find((x) => x.job === job);
    const at = r ? new Date(r.last_run_at) : null;
    const stale = !at || Date.now() - at.getTime() > maxMinutes * 60_000;
    return { job, lastRunAt: at ? at.toISOString() : "", ok: !!r && r.last_ok, detail: r?.detail ?? (r ? null : "Never run"), stale };
  });
  const emailOk = mail.failed === 0 && (mail.oldest ?? 0) < 30;
  const ok = dbOk && emailOk;
  return {
    ok,
    checks: {
      database: { ok: dbOk, ms },
      payments: {
        ok: true,
        provider: provider.name,
        testMode: provider.testMode,
        detail: provider.testMode ? "Test mode: no real money moves" : "Live",
      },
      email: { ok: emailOk, pending: mail.pending, failed: mail.failed, oldestPendingMinutes: mail.oldest },
      webhooks: { ok: true, eventsLastDay: hooks.n, lastEventAt: hooks.last ? new Date(hooks.last).toISOString() : null },
    },
    cron,
  };
}
