import "server-only";
import { db, rows, type Queryable } from "../db";
import { errorFields, log } from "../logger";
import { storage as realStorage, type Storage } from "../storage";

export const RETENTION = {
  pageViewDays: 90,
  sentEmailDays: 30,
  /** An upload nobody attached to a post within this long is abandoned. */
  orphanUploadHours: 24,
  /** Cap per run so one job never holds the database for long; it simply continues next time. */
  orphanBatch: 200,
} as const;

export interface CleanupResult {
  pageViews: number;
  rateLimits: number;
  sentEmails: number;
  orphanUploads: number;
}

/**
 * Housekeeping, safe to run any time and repeatedly:
 *  - old page views (analytics keeps 90 days)
 *  - expired rate-limit counters
 *  - delivered emails older than 30 days (failed ones stay for investigation)
 *  - uploaded files that never became a post attachment
 */
export async function runCleanup(conn: Queryable = db, storage: Storage = realStorage): Promise<CleanupResult> {
  const count = async (sql: string, params: unknown[] = []) => (await conn.query(sql, params)).rowCount ?? 0;

  const pageViews = await count("delete from public.page_views where created_at < now() - make_interval(days => $1)", [RETENTION.pageViewDays]);
  const rateLimits = await count("delete from public.rate_limits where window_start < now() - interval '1 day'");
  const sentEmails = await count("delete from public.email_outbox where status = 'sent' and sent_at < now() - make_interval(days => $1)", [RETENTION.sentEmailDays]);

  const orphans = await rows<{ name: string }>(
    `select o.name from storage.objects o
     where o.bucket_id = 'community-attachments'
       and o.created_at < now() - make_interval(hours => $1)
       and not exists (select 1 from public.post_attachments a where a.storage_path = o.name)
     order by o.created_at limit $2`,
    [RETENTION.orphanUploadHours, RETENTION.orphanBatch],
    conn,
  );
  let orphanUploads = 0;
  if (orphans.length) {
    try {
      await storage.remove(orphans.map((o) => o.name));
      orphanUploads = orphans.length;
    } catch (e) {
      log.warn("orphan upload cleanup failed", errorFields(e));
    }
  }
  return { pageViews, rateLimits, sentEmails, orphanUploads };
}
