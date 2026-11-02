import type { Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { bookingRules, getPackage, site, uploadRules } from '../../config/site';
import type {
  BookingCreatedResponse,
  OkResponse,
  ReferenceResponse,
  SlotsResponse,
} from '../../shared/api-types';
import {
  bookingDateRange,
  computeBookableDays,
  findOpenWindow,
  isWithinBookingRange,
  type SchedulingPolicy,
} from '../../shared/availability';
import { addDays, zonedDateTime } from '../../shared/dates';
import {
  applicationRequestSchema,
  bookingRequestSchema,
  contactRequestSchema,
  quoteRequestSchema,
  slotsQuerySchema,
} from '../../shared/schemas';
import { isEnabled } from '../env';
import { ApiError } from '../errors';
import { clientIp, jsonBodyLimit, parseJson, parseQuery, validate } from '../http';
import { log } from '../lib/log';
import { rateLimit } from '../middleware/core';
import { insertApplication } from '../repositories/applications';
import { listClosures, listOverrides, listRules } from '../repositories/availability';
import {
  countActiveBookingsForEmail,
  countActiveBySlot,
  insertBookingIfAvailable,
  type InsertBookingResult,
} from '../repositories/bookings';
import { insertMessage } from '../repositories/messages';
import { insertQuoteWithPhotos, type NewQuotePhoto } from '../repositories/quotes';
import { isUniqueViolation } from '../repositories/sql';
import { newId, newReference } from '../services/ids';
import type { MailMessage } from '../services/mailer';
import {
  applicationOwnerAlert,
  bookingCustomerConfirmation,
  bookingOwnerAlert,
  deliver,
  messageOwnerAlert,
  quoteOwnerAlert,
} from '../services/notifications';
import { photoKey, validatePhotos } from '../services/uploads';
import type { AppEnv } from '../types';

export const schedulingPolicy: SchedulingPolicy = {
  timeZone: site.timeZone,
  minLeadHours: bookingRules.minLeadHours,
  horizonDays: bookingRules.horizonDays,
};

/** Multipart quote uploads: photo limit plus generous room for the text fields and multipart framing. */
const QUOTE_BODY_LIMIT_BYTES = uploadRules.maxTotalBytes + 1024 * 1024;

const quoteBodyLimit = bodyLimit({
  maxSize: QUOTE_BODY_LIMIT_BYTES,
  onError: () => {
    throw new ApiError(413, 'payload_too_large', 'Photos must add up to 30 MB or less.', {
      photos: 'All photos together must be 30 MB or smaller.',
    });
  },
});

async function verifyHuman(c: Context<AppEnv>, token: string): Promise<void> {
  const verifier = c.var.deps.turnstile(c.env);
  if (!verifier) {
    log('error', 'turnstile.not_configured', { requestId: c.var.requestId });
    throw new ApiError(
      503,
      'verification_unavailable',
      `Online forms are temporarily unavailable. Please email us at ${site.contact.email}.`,
    );
  }
  const outcome = await verifier.verify(token, clientIp(c));
  if (!outcome.success) {
    log('warn', 'turnstile.failed', {
      requestId: c.var.requestId,
      codes: outcome.errorCodes.join(',').slice(0, 100),
    });
    throw new ApiError(
      400,
      'verification_failed',
      'We couldn’t confirm you’re a person. Please complete the check again and resubmit.',
      { turnstileToken: 'Please complete the verification check again.' },
    );
  }
}

/** Honeypot hit: pretend it worked, store nothing (ADR 0006). */
function honeypotTriggered(c: Context<AppEnv>, value: string | undefined): boolean {
  if (value === undefined || value.trim() === '') return false;
  log('warn', 'honeypot.triggered', {
    requestId: c.var.requestId,
    path: new URL(c.req.url).pathname,
  });
  return true;
}

function notifyOwner(
  c: Context<AppEnv>,
  drafts: readonly Omit<MailMessage, 'to'>[],
  extra: MailMessage[] = [],
): void {
  const owner = c.env.NOTIFY_EMAIL?.trim();
  const messages: MailMessage[] = [
    ...(owner ? drafts.map((d) => ({ ...d, to: owner })) : []),
    ...extra,
  ];
  if (!owner) log('warn', 'email.owner_not_configured', { requestId: c.var.requestId });
  if (messages.length === 0) return;
  c.executionCtx.waitUntil(deliver(c.var.deps.mailer(c.env), messages, c.var.requestId));
}

export function registerPublicRoutes(app: Hono<AppEnv>): void {
  app.get('/health', (c) => c.json<OkResponse>({ ok: true }));

  app.get('/slots', async (c) => {
    const query = parseQuery(c, slotsQuerySchema);
    const now = c.var.deps.clock.now();
    const { firstDate, lastDate } = bookingDateRange(now, schedulingPolicy);
    const from = query.from !== undefined && query.from > firstDate ? query.from : firstDate;
    const lastRequested = addDays(from, query.days - 1);
    const to = lastRequested < lastDate ? lastRequested : lastDate;
    if (from > lastDate) {
      return c.json<SlotsResponse>({ timeZone: site.timeZone, days: [] });
    }
    const db = c.env.DB;
    const [rules, overrides, closures, bookedCounts] = await Promise.all([
      listRules(db),
      listOverrides(db, from, to),
      listClosures(db, from, to),
      countActiveBySlot(db, from, to),
    ]);
    const days = computeBookableDays({
      now,
      policy: schedulingPolicy,
      from,
      days: query.days,
      rules,
      overrides,
      closures,
      bookedCounts,
    });
    return c.json<SlotsResponse>({ timeZone: site.timeZone, days });
  });

  app.post('/bookings', jsonBodyLimit, rateLimit('booking'), async (c) => {
    const input = await parseJson(c, bookingRequestSchema);
    const pkg = getPackage(input.package);
    if (honeypotTriggered(c, input.company)) {
      return c.json<BookingCreatedResponse>(
        {
          reference: newReference('SF'),
          package: input.package,
          date: input.date,
          startTime: input.startTime,
          endTime: input.startTime,
          priceCents: pkg.priceCents,
        },
        201,
      );
    }
    await verifyHuman(c, input.turnstileToken);

    const now = c.var.deps.clock.now();
    const db = c.env.DB;
    const unavailable = new ApiError(
      409,
      'slot_unavailable',
      'That time isn’t available anymore. Please choose another window.',
      { startTime: 'Choose another time.' },
    );
    if (!isWithinBookingRange(input.date, input.startTime, now, schedulingPolicy))
      throw unavailable;

    const [rules, overrides, closures] = await Promise.all([
      listRules(db),
      listOverrides(db, input.date, input.date),
      listClosures(db, input.date, input.date),
    ]);
    const window = findOpenWindow(input.date, input.startTime, rules, overrides, closures);
    if (!window) throw unavailable;

    const today = zonedDateTime(now, site.timeZone).date;
    const active = await countActiveBookingsForEmail(db, input.email, today);
    if (active >= bookingRules.maxActivePerEmail) {
      throw new ApiError(
        409,
        'too_many_bookings',
        `You already have ${bookingRules.maxActivePerEmail} upcoming bookings. Contact us if you need more.`,
      );
    }

    const createdAt = now.toISOString();
    const booking = {
      id: newId(),
      reference: newReference('SF'),
      package: input.package,
      priceCents: pkg.priceCents,
      date: input.date,
      startTime: window.startTime,
      endTime: window.endTime,
      name: input.name,
      email: input.email,
      phone: input.phone,
      building: input.building,
      room: input.room,
      paymentPreference: input.paymentPreference,
      notes: input.notes,
      createdAt,
    };

    let result: InsertBookingResult | undefined;
    for (let attempt = 0; attempt < 3 && result === undefined; attempt++) {
      try {
        result = await insertBookingIfAvailable(db, booking, window.capacity);
      } catch (error) {
        if (!isUniqueViolation(error, 'reference')) throw error;
        booking.reference = newReference('SF');
      }
    }
    if (result === undefined) throw new Error('Could not allocate a unique booking reference');
    if (result === 'duplicate') {
      throw new ApiError(409, 'already_booked', 'You already have a booking in this window.', {
        startTime: 'You’re already booked for this time.',
      });
    }
    if (result === 'slot_full') {
      throw new ApiError(
        409,
        'slot_full',
        'Sorry, that window just filled up. Please choose another time.',
        {
          startTime: 'This window is full. Choose another time.',
        },
      );
    }

    log('info', 'booking.created', { requestId: c.var.requestId, reference: booking.reference });
    const customerEmails: MailMessage[] = isEnabled(c.env.SEND_CUSTOMER_EMAILS)
      ? [{ ...bookingCustomerConfirmation(booking), to: booking.email }]
      : [];
    notifyOwner(c, [bookingOwnerAlert(booking)], customerEmails);

    return c.json<BookingCreatedResponse>(
      {
        reference: booking.reference,
        package: booking.package,
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        priceCents: booking.priceCents,
      },
      201,
    );
  });

  app.post('/quotes', quoteBodyLimit, rateLimit('quote'), async (c) => {
    const contentType = c.req.header('content-type') ?? '';
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
      throw new ApiError(
        415,
        'unsupported_media_type',
        'Quote requests must be sent as a form upload.',
      );
    }
    let form: FormData;
    try {
      form = await c.req.formData();
    } catch {
      throw new ApiError(400, 'invalid_form', 'The form data could not be read. Please try again.');
    }
    const fields: Record<string, string> = {};
    const files: File[] = [];
    for (const [key, value] of form.entries()) {
      if (typeof value === 'string') {
        if (key !== 'photos') fields[key] = value;
      } else if (key === 'photos') {
        files.push(value);
      }
    }
    const input = validate(quoteRequestSchema, fields);
    if (honeypotTriggered(c, input.company)) {
      return c.json<ReferenceResponse>({ reference: newReference('Q') }, 201);
    }
    await verifyHuman(c, input.turnstileToken);
    const photos = await validatePhotos(files);

    const now = c.var.deps.clock.now().toISOString();
    const quoteId = newId();
    let reference = newReference('Q');
    const stored: NewQuotePhoto[] = [];
    try {
      const uploads = await Promise.allSettled(
        photos.map(async (photo) => {
          const id = newId();
          const key = photoKey(quoteId, id);
          await c.env.UPLOADS.put(key, photo.bytes, {
            httpMetadata: { contentType: photo.contentType },
            customMetadata: { quoteId },
          });
          stored.push({
            id,
            r2Key: key,
            contentType: photo.contentType,
            sizeBytes: photo.sizeBytes,
          });
        }),
      );
      const failed = uploads.find((u) => u.status === 'rejected');
      if (failed)
        throw failed.reason instanceof Error ? failed.reason : new Error('Photo upload failed');
      const { turnstileToken: _token, company: _company, ...quote } = input;
      for (let attempt = 1; ; attempt++) {
        try {
          await insertQuoteWithPhotos(
            c.env.DB,
            { ...quote, id: quoteId, reference, createdAt: now },
            stored,
          );
          break;
        } catch (error) {
          if (attempt >= 3 || !isUniqueViolation(error, 'reference')) throw error;
          reference = newReference('Q');
        }
      }
    } catch (error) {
      // Don't leave orphaned photos behind if the quote couldn't be saved.
      if (stored.length > 0) {
        c.executionCtx.waitUntil(
          c.env.UPLOADS.delete(stored.map((p) => p.r2Key)).catch(() => undefined),
        );
      }
      throw error;
    }

    log('info', 'quote.created', { requestId: c.var.requestId, reference, photos: stored.length });
    notifyOwner(c, [
      quoteOwnerAlert({
        reference,
        name: input.name,
        email: input.email,
        phone: input.phone,
        building: input.building,
        room: input.room,
        space: input.space,
        description: input.description,
        preferredTiming: input.preferredTiming,
        photoCount: stored.length,
      }),
    ]);
    return c.json<ReferenceResponse>({ reference }, 201);
  });

  app.post('/applications', jsonBodyLimit, rateLimit('application'), async (c) => {
    const input = await parseJson(c, applicationRequestSchema);
    if (honeypotTriggered(c, input.company)) return c.json<OkResponse>({ ok: true }, 201);
    await verifyHuman(c, input.turnstileToken);

    const { turnstileToken: _token, company: _company, agreeTerms: _agree, ...application } = input;
    const id = newId();
    await insertApplication(c.env.DB, {
      ...application,
      id,
      createdAt: c.var.deps.clock.now().toISOString(),
    });
    log('info', 'application.created', { requestId: c.var.requestId, id });
    notifyOwner(c, [applicationOwnerAlert(application)]);
    return c.json<OkResponse>({ ok: true }, 201);
  });

  app.post('/contact', jsonBodyLimit, rateLimit('contact'), async (c) => {
    const input = await parseJson(c, contactRequestSchema);
    if (honeypotTriggered(c, input.company)) return c.json<OkResponse>({ ok: true }, 201);
    await verifyHuman(c, input.turnstileToken);

    const { turnstileToken: _token, company: _company, ...message } = input;
    const id = newId();
    await insertMessage(c.env.DB, {
      ...message,
      id,
      createdAt: c.var.deps.clock.now().toISOString(),
    });
    log('info', 'message.created', { requestId: c.var.requestId, id });
    notifyOwner(c, [messageOwnerAlert(message)]);
    return c.json<OkResponse>({ ok: true }, 201);
  });
}
