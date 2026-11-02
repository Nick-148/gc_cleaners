import type { BookingStatus, PackageId, PaymentMethod } from '../../config/site';
import type { AdminBooking } from '../../shared/api-types';
import { slotKey } from '../../shared/availability';
import type { ClockTime, IsoDate } from '../../shared/dates';
import { ACTIVE_STATUSES_SQL, orNull } from './sql';

interface BookingRow {
  id: string;
  reference: string;
  status: BookingStatus;
  package: PackageId;
  price_cents: number;
  date: string;
  start_time: string;
  end_time: string;
  name: string;
  email: string;
  phone: string;
  building: string;
  room: string;
  payment_preference: PaymentMethod;
  notes: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

function toAdminBooking(row: BookingRow): AdminBooking {
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    package: row.package,
    priceCents: row.price_cents,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    name: row.name,
    email: row.email,
    phone: row.phone,
    building: row.building,
    room: row.room,
    paymentPreference: row.payment_preference,
    notes: row.notes,
    adminNotes: row.admin_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface NewBooking {
  id: string;
  reference: string;
  package: PackageId;
  priceCents: number;
  date: IsoDate;
  startTime: ClockTime;
  endTime: ClockTime;
  name: string;
  email: string;
  phone: string;
  building: string;
  room: string;
  paymentPreference: PaymentMethod;
  notes: string | undefined;
  createdAt: string;
}

export type InsertBookingResult = 'created' | 'slot_full' | 'duplicate';

/**
 * Inserts a booking only if the window has spare capacity and this email doesn't already
 * hold a spot in it. A single statement, so concurrent requests can't overbook (ADR 0004).
 */
export async function insertBookingIfAvailable(
  db: D1Database,
  b: NewBooking,
  capacity: number,
): Promise<InsertBookingResult> {
  const result = await db
    .prepare(
      `INSERT INTO bookings (id, reference, status, package, price_cents, date, start_time, end_time,
         name, email, phone, building, room, payment_preference, notes, created_at, updated_at)
       SELECT ?1, ?2, 'pending', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?15
       WHERE (SELECT COUNT(*) FROM bookings
               WHERE date = ?5 AND start_time = ?6 AND status IN ${ACTIVE_STATUSES_SQL}) < ?16
         AND NOT EXISTS (SELECT 1 FROM bookings
               WHERE email = ?9 AND date = ?5 AND start_time = ?6 AND status IN ${ACTIVE_STATUSES_SQL})`,
    )
    .bind(
      b.id,
      b.reference,
      b.package,
      b.priceCents,
      b.date,
      b.startTime,
      b.endTime,
      b.name,
      b.email,
      b.phone,
      b.building,
      b.room,
      b.paymentPreference,
      orNull(b.notes),
      b.createdAt,
      capacity,
    )
    .run();
  if (result.meta.changes === 1) return 'created';

  const duplicate = await db
    .prepare(
      `SELECT 1 AS hit FROM bookings
       WHERE email = ?1 AND date = ?2 AND start_time = ?3 AND status IN ${ACTIVE_STATUSES_SQL} LIMIT 1`,
    )
    .bind(b.email, b.date, b.startTime)
    .first<{ hit: number }>();
  return duplicate ? 'duplicate' : 'slot_full';
}

/** Active bookings on or after `fromDate` for an email address. */
export async function countActiveBookingsForEmail(
  db: D1Database,
  email: string,
  fromDate: IsoDate,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM bookings
       WHERE email = ?1 AND date >= ?2 AND status IN ${ACTIVE_STATUSES_SQL}`,
    )
    .bind(email, fromDate)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Map of slotKey(date, start) → active booking count, for dates in [from, to]. */
export async function countActiveBySlot(
  db: D1Database,
  from: IsoDate,
  to: IsoDate,
): Promise<Map<string, number>> {
  const { results } = await db
    .prepare(
      `SELECT date, start_time, COUNT(*) AS n FROM bookings
       WHERE date BETWEEN ?1 AND ?2 AND status IN ${ACTIVE_STATUSES_SQL}
       GROUP BY date, start_time`,
    )
    .bind(from, to)
    .all<{ date: string; start_time: string; n: number }>();
  return new Map(results.map((r) => [slotKey(r.date, r.start_time), r.n]));
}

export async function listBookings(
  db: D1Database,
  filter: {
    from?: IsoDate | undefined;
    to?: IsoDate | undefined;
    status?: BookingStatus | undefined;
    limit: number;
    offset: number;
  },
): Promise<AdminBooking[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM bookings
       WHERE (?1 IS NULL OR date >= ?1)
         AND (?2 IS NULL OR date <= ?2)
         AND (?3 IS NULL OR status = ?3)
       ORDER BY date ASC, start_time ASC, created_at ASC
       LIMIT ?4 OFFSET ?5`,
    )
    .bind(
      orNull(filter.from),
      orNull(filter.to),
      orNull(filter.status),
      filter.limit,
      filter.offset,
    )
    .all<BookingRow>();
  return results.map(toAdminBooking);
}

export async function getBooking(db: D1Database, id: string): Promise<AdminBooking | null> {
  const row = await db.prepare('SELECT * FROM bookings WHERE id = ?1').bind(id).first<BookingRow>();
  return row ? toAdminBooking(row) : null;
}

/**
 * Updates status and/or notes. When `capacity` is given (re-activating a cancelled or no-show
 * booking), the update only applies if the window still has room, checked atomically in the same
 * statement as the insert path (ADR 0004). Returns null if no row was updated.
 */
export async function updateBooking(
  db: D1Database,
  id: string,
  patch: { status?: BookingStatus | undefined; adminNotes?: string | null | undefined },
  now: string,
  capacity: number | null = null,
): Promise<AdminBooking | null> {
  const row = await db
    .prepare(
      `UPDATE bookings
       SET status = COALESCE(?2, status),
           admin_notes = CASE WHEN ?3 = 1 THEN ?4 ELSE admin_notes END,
           updated_at = ?5
       WHERE id = ?1
         AND (?6 IS NULL OR (SELECT COUNT(*) FROM bookings AS other
               WHERE other.date = bookings.date AND other.start_time = bookings.start_time
                 AND other.id <> bookings.id AND other.status IN ${ACTIVE_STATUSES_SQL}) < ?6)
       RETURNING *`,
    )
    .bind(
      id,
      orNull(patch.status),
      patch.adminNotes === undefined ? 0 : 1,
      orNull(patch.adminNotes),
      now,
      capacity,
    )
    .first<BookingRow>();
  return row ? toAdminBooking(row) : null;
}
