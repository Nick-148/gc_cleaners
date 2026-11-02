import type { Context, Hono } from 'hono';
import {
  activeBookingStatuses,
  applicationStatuses,
  messageStatuses,
  quoteStatuses,
  site,
  type ApplicationStatus,
  type MessageStatus,
  type QuoteStatus,
} from '../../config/site';
import type {
  AdminAvailability,
  AdminMe,
  AdminScheduleWindow,
  ListResponse,
  OkResponse,
} from '../../shared/api-types';
import { findOpenWindow, slotKey, windowsForDate } from '../../shared/availability';
import { addDays, isValidIsoDate, zonedDateTime } from '../../shared/dates';
import {
  adminBookingsQuerySchema,
  adminListQuerySchema,
  applicationUpdateSchema,
  availabilityRuleSchema,
  bookingUpdateSchema,
  closureSchema,
  messageUpdateSchema,
  quoteUpdateSchema,
  windowOverrideSchema,
} from '../../shared/schemas';
import { z } from 'zod';
import { ApiError } from '../errors';
import { jsonBodyLimit, parseJson, parseQuery, requireParam } from '../http';
import { listApplications, updateApplication } from '../repositories/applications';
import {
  deleteClosure,
  deleteOverride,
  deleteRule,
  insertOverride,
  insertRule,
  listClosures,
  listOverrides,
  listRules,
  updateRule,
  upsertClosure,
} from '../repositories/availability';
import {
  countActiveBySlot,
  getBooking,
  listBookings,
  updateBooking,
} from '../repositories/bookings';
import { listMessages, updateMessageStatus } from '../repositories/messages';
import { adminSummary, insertAudit } from '../repositories/ops';
import { getQuotePhoto, listQuotes, updateQuote } from '../repositories/quotes';
import { isUniqueViolation } from '../repositories/sql';
import { newId } from '../services/ids';
import { EXTENSIONS } from '../services/uploads';
import type { AppEnv } from '../types';

const notFound = (): ApiError => new ApiError(404, 'not_found', 'Not found.');

function nowIso(c: Context<AppEnv>): string {
  return c.var.deps.clock.now().toISOString();
}

function today(c: Context<AppEnv>): string {
  return zonedDateTime(c.var.deps.clock.now(), site.timeZone).date;
}

/** Records an admin mutation. Details must not contain customer PII. */
async function audit(
  c: Context<AppEnv>,
  action: string,
  entityType: string,
  entityId: string | undefined,
  details?: Record<string, string | number | boolean | null>,
): Promise<void> {
  await insertAudit(c.env.DB, {
    id: newId(),
    actor: c.var.adminEmail,
    action,
    entityType,
    entityId,
    details,
    createdAt: nowIso(c),
  });
}

function statusFilter<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | undefined {
  if (value === undefined || value === '') return undefined;
  if (!(allowed as readonly string[]).includes(value)) {
    throw new ApiError(400, 'validation_failed', 'Unknown status filter.', {
      status: 'Unknown status.',
    });
  }
  return value as T;
}

const scheduleQuerySchema = z.object({
  from: z.string().refine(isValidIsoDate).optional(),
  days: z.coerce.number().int().min(1).max(62).default(14),
});

export function registerAdminRoutes(admin: Hono<AppEnv>): void {
  admin.get('/me', (c) => c.json<AdminMe>({ email: c.var.adminEmail }));

  admin.get('/summary', async (c) => c.json(await adminSummary(c.env.DB, today(c))));

  // ---------- bookings ----------

  admin.get('/bookings', async (c) => {
    const q = parseQuery(c, adminBookingsQuerySchema);
    const items = await listBookings(c.env.DB, {
      from: q.from,
      to: q.to,
      status: q.status,
      limit: q.limit,
      offset: q.offset,
    });
    return c.json<ListResponse<(typeof items)[number]>>({ items });
  });

  admin.patch('/bookings/:id', jsonBodyLimit, async (c) => {
    const id = requireParam(c, 'id');
    const patch = await parseJson(c, bookingUpdateSchema);
    const db = c.env.DB;
    const current = await getBooking(db, id);
    if (!current) throw notFound();

    // Re-activating (e.g. Restore, Undo no-show) must not overbook the window (ADR 0004).
    let capacity: number | null = null;
    const reactivating =
      patch.status !== undefined &&
      activeBookingStatuses.includes(patch.status) &&
      !activeBookingStatuses.includes(current.status);
    if (reactivating) {
      const [rules, overrides, closures] = await Promise.all([
        listRules(db),
        listOverrides(db, current.date, current.date),
        listClosures(db, current.date, current.date),
      ]);
      capacity =
        findOpenWindow(current.date, current.startTime, rules, overrides, closures)?.capacity ?? 0;
    }

    const updated = await updateBooking(db, id, patch, nowIso(c), capacity);
    if (!updated) {
      throw new ApiError(
        409,
        'slot_full',
        'That window is full or closed. Raise its capacity with a date override first.',
      );
    }
    await audit(c, 'booking.update', 'booking', id, {
      status: patch.status ?? null,
      notesChanged: patch.adminNotes !== undefined,
    });
    return c.json(updated);
  });

  // ---------- availability ----------

  admin.get('/availability', async (c) => {
    const from = today(c);
    const to = addDays(from, 366);
    const [rules, overrides, closures] = await Promise.all([
      listRules(c.env.DB),
      listOverrides(c.env.DB, from, to),
      listClosures(c.env.DB, from, to),
    ]);
    return c.json<AdminAvailability>({ rules, overrides, closures });
  });

  admin.get('/schedule', async (c) => {
    const q = parseQuery(c, scheduleQuerySchema);
    const from = q.from ?? today(c);
    const to = addDays(from, q.days - 1);
    const [rules, overrides, closures, booked] = await Promise.all([
      listRules(c.env.DB),
      listOverrides(c.env.DB, from, to),
      listClosures(c.env.DB, from, to),
      countActiveBySlot(c.env.DB, from, to),
    ]);
    const items: AdminScheduleWindow[] = [];
    for (let i = 0; i < q.days; i++) {
      const date = addDays(from, i);
      for (const w of windowsForDate(date, rules, overrides, closures)) {
        items.push({ ...w, booked: booked.get(slotKey(date, w.startTime)) ?? 0 });
      }
    }
    return c.json<ListResponse<AdminScheduleWindow>>({ items });
  });

  const conflict = (message: string): ApiError =>
    new ApiError(409, 'conflict', message, { startTime: message });

  admin.post('/availability/rules', jsonBodyLimit, async (c) => {
    const input = await parseJson(c, availabilityRuleSchema);
    try {
      const rule = await insertRule(c.env.DB, newId(), input, nowIso(c));
      await audit(c, 'rule.create', 'availability_rule', rule.id, {
        weekday: rule.weekday,
        startTime: rule.startTime,
        capacity: rule.capacity,
      });
      return c.json(rule, 201);
    } catch (error) {
      if (isUniqueViolation(error))
        throw conflict('A window already starts at that time on that day.');
      throw error;
    }
  });

  admin.put('/availability/rules/:id', jsonBodyLimit, async (c) => {
    const id = requireParam(c, 'id');
    const input = await parseJson(c, availabilityRuleSchema);
    try {
      const rule = await updateRule(c.env.DB, id, input, nowIso(c));
      if (!rule) throw notFound();
      await audit(c, 'rule.update', 'availability_rule', id, {
        weekday: rule.weekday,
        startTime: rule.startTime,
        capacity: rule.capacity,
        active: rule.active,
      });
      return c.json(rule);
    } catch (error) {
      if (isUniqueViolation(error))
        throw conflict('A window already starts at that time on that day.');
      throw error;
    }
  });

  admin.delete('/availability/rules/:id', async (c) => {
    const id = requireParam(c, 'id');
    if (!(await deleteRule(c.env.DB, id))) throw notFound();
    await audit(c, 'rule.delete', 'availability_rule', id);
    return c.json<OkResponse>({ ok: true });
  });

  admin.post('/availability/overrides', jsonBodyLimit, async (c) => {
    const input = await parseJson(c, windowOverrideSchema);
    try {
      const override = await insertOverride(c.env.DB, newId(), input, nowIso(c));
      await audit(c, 'override.create', 'window_override', override.id, {
        date: override.date,
        startTime: override.startTime,
        capacity: override.capacity,
      });
      return c.json(override, 201);
    } catch (error) {
      if (isUniqueViolation(error))
        throw conflict('There is already an override starting at that time on that date.');
      throw error;
    }
  });

  admin.delete('/availability/overrides/:id', async (c) => {
    const id = requireParam(c, 'id');
    if (!(await deleteOverride(c.env.DB, id))) throw notFound();
    await audit(c, 'override.delete', 'window_override', id);
    return c.json<OkResponse>({ ok: true });
  });

  admin.post('/availability/closures', jsonBodyLimit, async (c) => {
    const input = await parseJson(c, closureSchema);
    const closure = await upsertClosure(c.env.DB, input, nowIso(c));
    await audit(c, 'closure.upsert', 'closure', closure.date);
    return c.json(closure, 201);
  });

  admin.delete('/availability/closures/:date', async (c) => {
    const date = c.req.param('date');
    if (!isValidIsoDate(date)) throw notFound();
    if (!(await deleteClosure(c.env.DB, date))) throw notFound();
    await audit(c, 'closure.delete', 'closure', date);
    return c.json<OkResponse>({ ok: true });
  });

  // ---------- quotes ----------

  admin.get('/quotes', async (c) => {
    const q = parseQuery(c, adminListQuerySchema);
    const items = await listQuotes(c.env.DB, {
      status: statusFilter<QuoteStatus>(q.status, quoteStatuses),
      limit: q.limit,
      offset: q.offset,
    });
    return c.json({ items });
  });

  admin.patch('/quotes/:id', jsonBodyLimit, async (c) => {
    const id = requireParam(c, 'id');
    const patch = await parseJson(c, quoteUpdateSchema);
    if (!(await updateQuote(c.env.DB, id, patch, nowIso(c)))) throw notFound();
    await audit(c, 'quote.update', 'quote', id, {
      status: patch.status ?? null,
      quotedCents: patch.quotedCents ?? null,
    });
    return c.json<OkResponse>({ ok: true });
  });

  admin.get('/quotes/:id/photos/:photoId', async (c) => {
    const quoteId = requireParam(c, 'id');
    const photoId = requireParam(c, 'photoId');
    const photo = await getQuotePhoto(c.env.DB, quoteId, photoId);
    if (!photo) throw notFound();
    const object = await c.env.UPLOADS.get(photo.r2Key);
    if (!object) {
      throw new ApiError(
        410,
        'photo_expired',
        'This photo has been deleted under our 90-day retention policy.',
      );
    }
    const ext = EXTENSIONS[photo.contentType] ?? 'bin';
    return new Response(object.body, {
      headers: {
        'Content-Type': photo.contentType,
        'Content-Length': String(object.size),
        'Content-Disposition': `inline; filename="quote-photo-${photoId.slice(0, 8)}.${ext}"`,
        'Cache-Control': 'private, max-age=300',
        // Even if a file slipped past sniffing, it can't run script or load anything.
        'Content-Security-Policy':
          "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      },
    });
  });

  // ---------- applications ----------

  admin.get('/applications', async (c) => {
    const q = parseQuery(c, adminListQuerySchema);
    const items = await listApplications(c.env.DB, {
      status: statusFilter<ApplicationStatus>(q.status, applicationStatuses),
      limit: q.limit,
      offset: q.offset,
    });
    return c.json({ items });
  });

  admin.patch('/applications/:id', jsonBodyLimit, async (c) => {
    const id = requireParam(c, 'id');
    const patch = await parseJson(c, applicationUpdateSchema);
    if (!(await updateApplication(c.env.DB, id, patch, nowIso(c)))) throw notFound();
    await audit(c, 'application.update', 'application', id, { status: patch.status ?? null });
    return c.json<OkResponse>({ ok: true });
  });

  // ---------- messages ----------

  admin.get('/messages', async (c) => {
    const q = parseQuery(c, adminListQuerySchema);
    const items = await listMessages(c.env.DB, {
      status: statusFilter<MessageStatus>(q.status, messageStatuses),
      limit: q.limit,
      offset: q.offset,
    });
    return c.json({ items });
  });

  admin.patch('/messages/:id', jsonBodyLimit, async (c) => {
    const id = requireParam(c, 'id');
    const { status } = await parseJson(c, messageUpdateSchema);
    if (!(await updateMessageStatus(c.env.DB, id, status, nowIso(c)))) throw notFound();
    await audit(c, 'message.update', 'message', id, { status });
    return c.json<OkResponse>({ ok: true });
  });
}
