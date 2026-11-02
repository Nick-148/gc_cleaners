/** Operational tables: audit log, rate-limit counters and dashboard counts. */
import type { AdminSummary } from '../../shared/api-types';
import type { IsoDate } from '../../shared/dates';
import { ACTIVE_STATUSES_SQL, orNull } from './sql';

export async function insertAudit(
  db: D1Database,
  entry: {
    id: string;
    actor: string;
    action: string;
    entityType: string;
    entityId?: string | undefined;
    /** Must never contain customer PII. */
    details?: Record<string, string | number | boolean | null> | undefined;
    createdAt: string;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_log (id, actor, action, entity_type, entity_id, details, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    )
    .bind(
      entry.id,
      entry.actor,
      entry.action,
      entry.entityType,
      orNull(entry.entityId),
      entry.details ? JSON.stringify(entry.details) : null,
      entry.createdAt,
    )
    .run();
}

/** Increments the counter for (key, window) and returns the new count. Atomic upsert. */
export async function incrementRateLimit(
  db: D1Database,
  key: string,
  windowStart: number,
): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(key, windowStart)
    .first<{ count: number }>();
  return row?.count ?? 1;
}

export async function pruneRateLimits(db: D1Database, olderThan: number): Promise<void> {
  await db.prepare('DELETE FROM rate_limits WHERE window_start < ?1').bind(olderThan).run();
}

export async function adminSummary(db: D1Database, today: IsoDate): Promise<AdminSummary> {
  const row = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM bookings WHERE status = 'pending' AND date >= ?1) AS pending_bookings,
         (SELECT COUNT(*) FROM bookings WHERE status IN ${ACTIVE_STATUSES_SQL} AND date >= ?1) AS upcoming_bookings,
         (SELECT COUNT(*) FROM quotes WHERE status = 'new') AS new_quotes,
         (SELECT COUNT(*) FROM applications WHERE status = 'new') AS new_applications,
         (SELECT COUNT(*) FROM messages WHERE status = 'new') AS new_messages`,
    )
    .bind(today)
    .first<{
      pending_bookings: number;
      upcoming_bookings: number;
      new_quotes: number;
      new_applications: number;
      new_messages: number;
    }>();
  return {
    today,
    pendingBookings: row?.pending_bookings ?? 0,
    upcomingBookings: row?.upcoming_bookings ?? 0,
    newQuotes: row?.new_quotes ?? 0,
    newApplications: row?.new_applications ?? 0,
    newMessages: row?.new_messages ?? 0,
  };
}
