import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ApiErrorBody, ReferenceResponse } from '../../src/shared/api-types';
import { harness, jpegBytes, OWNER_EMAIL, PASS_TOKEN } from './helpers';

function quoteForm(overrides: Record<string, string> = {}, photos: Blob[] = []): FormData {
  const form = new FormData();
  const fields = {
    name: 'Sam Lee',
    email: 'Sam.Lee@Example.edu',
    phone: '',
    building: 'tavilla',
    room: '3C',
    space: 'both',
    description:
      'End-of-semester deep clean; the shower has some mildew and the floor needs a scrub.',
    preferredTiming: 'Weekend before checkout',
    turnstileToken: PASS_TOKEN,
    ...overrides,
  };
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  photos.forEach((p, i) => {
    form.append('photos', p, `photo-${i}.jpg`);
  });
  return form;
}

const postForm = (h: Awaited<ReturnType<typeof harness>>, form: FormData) =>
  h.fetch('/api/quotes', { method: 'POST', body: form });

describe('POST /api/quotes', () => {
  it('stores the quote, its photos in R2 under server-generated keys, and alerts the owner', async () => {
    const h = await harness();
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const res = await postForm(
      h,
      quoteForm({}, [
        new Blob([jpegBytes(2048)], { type: 'image/jpeg' }),
        // The client-declared type is ignored; the stored type comes from the bytes.
        new Blob([png], { type: 'application/octet-stream' }),
      ]),
    );
    expect(res.status).toBe(201);
    const { reference } = (await res.json()) as ReferenceResponse;
    expect(reference).toMatch(/^Q-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$/);

    const quote = await env.DB.prepare('SELECT * FROM quotes WHERE reference = ?1')
      .bind(reference)
      .first<{ id: string; email: string; phone: string | null; status: string }>();
    expect(quote).toMatchObject({ email: 'sam.lee@example.edu', phone: null, status: 'new' });

    const photos = await env.DB.prepare(
      'SELECT r2_key, content_type, size_bytes FROM quote_photos WHERE quote_id = ?1 ORDER BY content_type',
    )
      .bind(quote?.id)
      .all<{ r2_key: string; content_type: string; size_bytes: number }>();
    expect(photos.results.map((p) => p.content_type)).toEqual(['image/jpeg', 'image/png']);
    for (const p of photos.results) {
      expect(p.r2_key).toMatch(new RegExp(`^quotes/${quote?.id}/[0-9a-f-]{36}$`));
      const object = await env.UPLOADS.get(p.r2_key);
      expect(object?.size).toBe(p.size_bytes);
      expect(object?.httpMetadata?.contentType).toBe(p.content_type);
    }

    expect(h.mailer.sent).toHaveLength(1);
    expect(h.mailer.sent[0]).toMatchObject({ to: OWNER_EMAIL, replyTo: 'sam.lee@example.edu' });
    expect(h.mailer.sent[0]?.subject).toContain('2 photos');
  });

  it('accepts a quote without photos', async () => {
    const h = await harness();
    const res = await postForm(h, quoteForm());
    expect(res.status).toBe(201);
  });

  it('rejects files that are not images, regardless of their declared type', async () => {
    const h = await harness();
    const fake = new Blob(['<script>alert(1)</script>'], { type: 'image/jpeg' });
    const res = await postForm(h, quoteForm({}, [fake]));
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorBody;
    expect(body.error.code).toBe('unsupported_photo_type');
    expect(body.error.fields?.photos).toBeDefined();
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM quotes').first<{ n: number }>();
    expect(count?.n).toBe(0);
    expect((await env.UPLOADS.list()).objects).toHaveLength(0);
  });

  it('rejects more than five photos', async () => {
    const h = await harness();
    const photos = Array.from({ length: 6 }, () => new Blob([jpegBytes()], { type: 'image/jpeg' }));
    const res = await postForm(h, quoteForm({}, photos));
    expect(res.status).toBe(400);
    expect(((await res.json()) as ApiErrorBody).error.code).toBe('too_many_photos');
  });

  it('rejects a single photo over 10 MB', async () => {
    const h = await harness();
    const big = new Blob([jpegBytes(10 * 1024 * 1024 + 1)], { type: 'image/jpeg' });
    const res = await postForm(h, quoteForm({}, [big]));
    expect(res.status).toBe(413);
  });

  it('validates text fields', async () => {
    const h = await harness();
    const res = await postForm(h, quoteForm({ description: 'too short', space: 'garage' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorBody;
    expect(Object.keys(body.error.fields ?? {}).sort()).toEqual(['description', 'space']);
  });

  it('requires multipart form data', async () => {
    const h = await harness();
    const { res } = await h.json('/api/quotes', { name: 'x' });
    expect(res.status).toBe(415);
  });

  it('rejects a failed Turnstile check before storing photos', async () => {
    const h = await harness();
    const res = await postForm(
      h,
      quoteForm({ turnstileToken: 'nope' }, [new Blob([jpegBytes()], { type: 'image/jpeg' })]),
    );
    expect(res.status).toBe(400);
    expect((await env.UPLOADS.list()).objects).toHaveLength(0);
  });
});

function validApplication(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Avery Chen',
    email: 'avery@example.edu',
    phone: '(978) 555-0144',
    classYear: 'sophomore',
    availability: ['fri', 'mon', 'mon'],
    hoursPerWeek: '6',
    experience: '',
    motivation: 'I like flexible hours and I am very detail oriented.',
    agreeTerms: true,
    turnstileToken: PASS_TOKEN,
    ...overrides,
  };
}

describe('POST /api/applications', () => {
  it('stores a normalized application and alerts the owner', async () => {
    const h = await harness();
    const { res } = await h.json('/api/applications', validApplication());
    expect(res.status).toBe(201);
    const row = await env.DB.prepare('SELECT * FROM applications').first();
    expect(row).toMatchObject({
      availability: '["mon","fri"]',
      hours_per_week: 6,
      experience: null,
      status: 'new',
    });
    expect(h.mailer.sent[0]?.subject).toBe('New cleaner application');
  });

  it('requires agreeing to the terms and at least one available day', async () => {
    const h = await harness();
    const { res, data } = await h.json<ApiErrorBody>(
      '/api/applications',
      validApplication({ agreeTerms: false, availability: [] }),
    );
    expect(res.status).toBe(400);
    expect(Object.keys(data.error.fields ?? {}).sort()).toEqual(['agreeTerms', 'availability']);
  });
});

describe('POST /api/contact', () => {
  const message = {
    name: 'Riley Park',
    email: 'riley@example.edu',
    topic: 'reschedule',
    bookingReference: 'sf-7k2q9m',
    message: 'Could we move my cleaning to Thursday?',
    turnstileToken: PASS_TOKEN,
  };

  it('stores the message with a normalized booking reference', async () => {
    const h = await harness();
    const { res } = await h.json('/api/contact', message);
    expect(res.status).toBe(201);
    const row = await env.DB.prepare('SELECT booking_reference, phone FROM messages').first();
    expect(row).toEqual({ booking_reference: 'SF-7K2Q9M', phone: null });
    expect(h.mailer.sent[0]?.subject).toBe('New message: Reschedule a booking (SF-7K2Q9M)');
  });

  it('escapes user content in the alert email', async () => {
    const h = await harness();
    await h.json('/api/contact', {
      ...message,
      message: '<img src=x onerror=alert(1)> hello there',
    });
    expect(h.mailer.sent[0]?.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(h.mailer.sent[0]?.html).not.toContain('<img src=x');
  });

  it('rejects a malformed booking reference', async () => {
    const h = await harness();
    const { res, data } = await h.json<ApiErrorBody>('/api/contact', {
      ...message,
      bookingReference: 'SF-0000',
    });
    expect(res.status).toBe(400);
    expect(data.error.fields?.bookingReference).toBeDefined();
  });

  it('still saves the message when email delivery fails', async () => {
    const h = await harness({
      deps: {
        mailer: () => ({ kind: 'resend', send: () => Promise.reject(new Error('SMTP down')) }),
      },
    });
    const { res } = await h.json('/api/contact', message);
    expect(res.status).toBe(201);
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM messages').first<{ n: number }>();
    expect(row?.n).toBe(1);
  });
});
