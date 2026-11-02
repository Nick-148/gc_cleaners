import type { QuoteStatus } from '../../config/site';
import type { AdminQuote, AdminQuotePhoto } from '../../shared/api-types';
import type { QuoteRequest } from '../../shared/schemas';
import { orNull } from './sql';

interface QuoteRow {
  id: string;
  reference: string;
  status: QuoteStatus;
  name: string;
  email: string;
  phone: string | null;
  building: string;
  room: string | null;
  space: AdminQuote['space'];
  description: string;
  preferred_timing: string | null;
  quoted_cents: number | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

interface PhotoRow {
  id: string;
  quote_id: string;
  r2_key: string;
  content_type: string;
  size_bytes: number;
}

function toAdminQuote(row: QuoteRow, photos: AdminQuotePhoto[]): AdminQuote {
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    name: row.name,
    email: row.email,
    phone: row.phone,
    building: row.building,
    room: row.room,
    space: row.space,
    description: row.description,
    preferredTiming: row.preferred_timing,
    quotedCents: row.quoted_cents,
    adminNotes: row.admin_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    photos,
  };
}

export interface NewQuotePhoto {
  id: string;
  r2Key: string;
  contentType: string;
  sizeBytes: number;
}

/** Inserts the quote and its photo rows atomically (D1 runs a batch as one transaction). */
export async function insertQuoteWithPhotos(
  db: D1Database,
  quote: { id: string; reference: string; createdAt: string } & Omit<
    QuoteRequest,
    'turnstileToken' | 'company'
  >,
  photos: readonly NewQuotePhoto[],
): Promise<void> {
  const statements = [
    db
      .prepare(
        `INSERT INTO quotes (id, reference, status, name, email, phone, building, room, space,
           description, preferred_timing, created_at, updated_at)
         VALUES (?1, ?2, 'new', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)`,
      )
      .bind(
        quote.id,
        quote.reference,
        quote.name,
        quote.email,
        orNull(quote.phone),
        quote.building,
        orNull(quote.room),
        quote.space,
        quote.description,
        orNull(quote.preferredTiming),
        quote.createdAt,
      ),
    ...photos.map((p) =>
      db
        .prepare(
          `INSERT INTO quote_photos (id, quote_id, r2_key, content_type, size_bytes, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
        )
        .bind(p.id, quote.id, p.r2Key, p.contentType, p.sizeBytes, quote.createdAt),
    ),
  ];
  await db.batch(statements);
}

export async function listQuotes(
  db: D1Database,
  filter: { status?: QuoteStatus | undefined; limit: number; offset: number },
): Promise<AdminQuote[]> {
  const { results: quotes } = await db
    .prepare(
      `SELECT * FROM quotes WHERE (?1 IS NULL OR status = ?1)
       ORDER BY created_at DESC LIMIT ?2 OFFSET ?3`,
    )
    .bind(orNull(filter.status), filter.limit, filter.offset)
    .all<QuoteRow>();
  if (quotes.length === 0) return [];

  // json_each keeps this to one bound parameter regardless of page size (D1 caps bindings at 100).
  const { results: photos } = await db
    .prepare(
      `SELECT id, quote_id, r2_key, content_type, size_bytes FROM quote_photos
       WHERE quote_id IN (SELECT value FROM json_each(?1)) ORDER BY created_at, id`,
    )
    .bind(JSON.stringify(quotes.map((q) => q.id)))
    .all<PhotoRow>();
  const byQuote = new Map<string, AdminQuotePhoto[]>();
  for (const p of photos) {
    const list = byQuote.get(p.quote_id) ?? [];
    list.push({ id: p.id, contentType: p.content_type, sizeBytes: p.size_bytes });
    byQuote.set(p.quote_id, list);
  }
  return quotes.map((q) => toAdminQuote(q, byQuote.get(q.id) ?? []));
}

export async function getQuotePhoto(
  db: D1Database,
  quoteId: string,
  photoId: string,
): Promise<{ r2Key: string; contentType: string } | null> {
  const row = await db
    .prepare('SELECT r2_key, content_type FROM quote_photos WHERE id = ?1 AND quote_id = ?2')
    .bind(photoId, quoteId)
    .first<{ r2_key: string; content_type: string }>();
  return row ? { r2Key: row.r2_key, contentType: row.content_type } : null;
}

export async function updateQuote(
  db: D1Database,
  id: string,
  patch: {
    status?: QuoteStatus | undefined;
    quotedCents?: number | null | undefined;
    adminNotes?: string | null | undefined;
  },
  now: string,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE quotes
       SET status = COALESCE(?2, status),
           quoted_cents = CASE WHEN ?3 = 1 THEN ?4 ELSE quoted_cents END,
           admin_notes = CASE WHEN ?5 = 1 THEN ?6 ELSE admin_notes END,
           updated_at = ?7
       WHERE id = ?1`,
    )
    .bind(
      id,
      orNull(patch.status),
      patch.quotedCents === undefined ? 0 : 1,
      orNull(patch.quotedCents),
      patch.adminNotes === undefined ? 0 : 1,
      orNull(patch.adminNotes),
      now,
    )
    .run();
  return result.meta.changes > 0;
}
