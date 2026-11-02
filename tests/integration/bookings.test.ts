import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type {
  ApiErrorBody,
  BookingCreatedResponse,
  SlotsResponse,
} from '../../src/shared/api-types';
import { FIRST_BOOKABLE_DATE, harness, OWNER_EMAIL, PASS_TOKEN, validBooking } from './helpers';

async function bookingCount(): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM bookings').first<{ n: number }>();
  return row?.n ?? 0;
}

describe('GET /api/health', () => {
  it('responds ok with hardened headers', async () => {
    const h = await harness();
    const res = await h.fetch('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(res.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const h = await harness();
    const res = await h.fetch('/api/nope');
    expect(res.status).toBe(404);
    const body = (await res.json()) as ApiErrorBody;
    expect(body.error.code).toBe('not_found');
  });
});

describe('GET /api/slots', () => {
  it('applies the lead time and returns remaining capacity per window', async () => {
    const h = await harness();
    const res = await h.fetch('/api/slots?days=3');
    expect(res.status).toBe(200);
    const body = (await res.json()) as SlotsResponse;
    expect(body.timeZone).toBe('America/New_York');
    expect(body.days.map((d) => d.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
    // Monday's windows start within 12 hours of "now", so they aren't bookable.
    expect(body.days[0]?.windows).toEqual([]);
    expect(body.days[1]?.windows).toEqual([
      { startTime: '16:00', endTime: '18:00', remaining: 2 },
      { startTime: '18:00', endTime: '20:00', remaining: 2 },
    ]);
  });

  it('reflects bookings, closures and overrides', async () => {
    const h = await harness();
    await h.json('/api/bookings', validBooking());
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO closures (date, reason, created_at) VALUES ('2026-11-04', 'Break', 'x')",
      ),
      env.DB.prepare(
        "INSERT INTO window_overrides (id, date, start_time, end_time, capacity, note, created_at) VALUES ('o1', '2026-11-03', '18:00', '20:00', 0, NULL, 'x'), ('o2', '2026-11-03', '20:00', '21:00', 1, 'Extra', 'x')",
      ),
    ]);
    const body = (await (
      await h.fetch('/api/slots?from=2026-11-03&days=2')
    ).json()) as SlotsResponse;
    expect(body.days[0]?.windows).toEqual([
      { startTime: '16:00', endTime: '18:00', remaining: 1 },
      { startTime: '20:00', endTime: '21:00', remaining: 1 },
    ]);
    expect(body.days[1]).toEqual({ date: '2026-11-04', windows: [] });
  });

  it('never returns days past the booking horizon', async () => {
    const h = await harness();
    const body = (await (
      await h.fetch('/api/slots?from=2026-11-28&days=10')
    ).json()) as SlotsResponse;
    expect(body.days.at(-1)?.date).toBe('2026-11-30');
  });

  it('rejects an invalid query', async () => {
    const h = await harness();
    const res = await h.fetch('/api/slots?from=2026-02-30');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/bookings', () => {
  it('creates a pending booking, snapshots the price and alerts the owner', async () => {
    const h = await harness();
    const { res, data } = await h.json<BookingCreatedResponse>('/api/bookings', validBooking());
    expect(res.status).toBe(201);
    expect(data).toMatchObject({
      package: 'room',
      date: FIRST_BOOKABLE_DATE,
      startTime: '16:00',
      endTime: '18:00',
      priceCents: 3000,
    });
    expect(data.reference).toMatch(/^SF-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$/);

    const row = await env.DB.prepare('SELECT * FROM bookings WHERE reference = ?1')
      .bind(data.reference)
      .first();
    expect(row).toMatchObject({
      status: 'pending',
      price_cents: 3000,
      email: 'jordan@example.edu',
      phone: '(978) 555-0123',
      payment_preference: 'venmo',
    });

    expect(h.mailer.sent).toHaveLength(1);
    expect(h.mailer.sent[0]?.to).toBe(OWNER_EMAIL);
    expect(h.mailer.sent[0]?.subject).toContain(data.reference);
    expect(h.mailer.sent[0]?.replyTo).toBe('jordan@example.edu');
  });

  it('sends a customer confirmation only when enabled', async () => {
    const h = await harness({ env: { SEND_CUSTOMER_EMAILS: 'true' } });
    await h.json('/api/bookings', validBooking());
    expect(h.mailer.sent.map((m) => m.to)).toEqual([OWNER_EMAIL, 'jordan@example.edu']);
  });

  it('never overbooks a window, even under concurrent requests', async () => {
    const h = await harness();
    const attempts = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        h.json<BookingCreatedResponse | ApiErrorBody>(
          '/api/bookings',
          validBooking({ email: `student${i}@example.edu` }),
        ),
      ),
    );
    const statuses = attempts.map((a) => a.res.status).sort();
    expect(statuses).toEqual([201, 201, 409, 409, 409, 409]);
    const full = attempts.find((a) => a.res.status === 409)?.data as ApiErrorBody;
    expect(full.error.code).toBe('slot_full');
    expect(await bookingCount()).toBe(2);
  });

  it('rejects a second booking by the same email in the same window', async () => {
    const h = await harness();
    await h.json('/api/bookings', validBooking());
    const { res, data } = await h.json<ApiErrorBody>(
      '/api/bookings',
      validBooking({ package: 'bundle' }),
    );
    expect(res.status).toBe(409);
    expect(data.error.code).toBe('already_booked');
  });

  it('limits active future bookings per email', async () => {
    const h = await harness();
    for (const [date, startTime] of [
      ['2026-11-03', '16:00'],
      ['2026-11-03', '18:00'],
      ['2026-11-04', '16:00'],
    ] as const) {
      const { res } = await h.json('/api/bookings', validBooking({ date, startTime }));
      expect(res.status).toBe(201);
    }
    const { res, data } = await h.json<ApiErrorBody>(
      '/api/bookings',
      validBooking({ date: '2026-11-04', startTime: '18:00' }),
    );
    expect(res.status).toBe(409);
    expect(data.error.code).toBe('too_many_bookings');
  });

  it.each([
    ['inside the lead time', { date: '2026-11-02', startTime: '18:00' }],
    ['past the horizon', { date: '2026-12-01', startTime: '16:00' }],
    ['a time with no window', { startTime: '09:00' }],
  ])('rejects a slot %s', async (_label, slot) => {
    const h = await harness();
    const { res, data } = await h.json<ApiErrorBody>('/api/bookings', validBooking(slot));
    expect(res.status).toBe(409);
    expect(data.error.code).toBe('slot_unavailable');
  });

  it('rejects a closed date', async () => {
    const h = await harness();
    await env.DB.prepare(
      "INSERT INTO closures (date, reason, created_at) VALUES ('2026-11-03', NULL, 'x')",
    ).run();
    const { res } = await h.json('/api/bookings', validBooking());
    expect(res.status).toBe(409);
  });

  it('returns field errors for invalid input', async () => {
    const h = await harness();
    const { res, data } = await h.json<ApiErrorBody>(
      '/api/bookings',
      validBooking({ email: 'not-an-email', phone: '123', agreePayment: false, room: '' }),
    );
    expect(res.status).toBe(400);
    expect(data.error.code).toBe('validation_failed');
    expect(Object.keys(data.error.fields ?? {}).sort()).toEqual([
      'agreePayment',
      'email',
      'phone',
      'room',
    ]);
  });

  it('refuses bathroom packages in halls with communal bathrooms', async () => {
    const h = await harness();
    const { res, data } = await h.json<ApiErrorBody>(
      '/api/bookings',
      validBooking({ building: 'ferrin', package: 'bathroom' }),
    );
    expect(res.status).toBe(400);
    expect(data.error.fields?.package).toMatch(/shared floor bathrooms/);
  });

  it('rejects a failed Turnstile check and stores nothing', async () => {
    const h = await harness();
    const { res, data } = await h.json<ApiErrorBody>(
      '/api/bookings',
      validBooking({ turnstileToken: 'forged' }),
    );
    expect(res.status).toBe(400);
    expect(data.error.code).toBe('verification_failed');
    expect(await bookingCount()).toBe(0);
  });

  it('fails closed when Turnstile is not configured', async () => {
    const h = await harness({ deps: { turnstile: () => null } });
    const { res, data } = await h.json<ApiErrorBody>('/api/bookings', validBooking());
    expect(res.status).toBe(503);
    expect(data.error.code).toBe('verification_unavailable');
  });

  it('silently drops honeypot submissions', async () => {
    const h = await harness();
    const { res } = await h.json('/api/bookings', validBooking({ company: 'Spam LLC' }));
    expect(res.status).toBe(201);
    expect(await bookingCount()).toBe(0);
    expect(h.mailer.sent).toHaveLength(0);
  });

  it.each([
    ['a cross-site fetch', { 'sec-fetch-site': 'cross-site' }],
    ['a same-site (other subdomain) fetch', { 'sec-fetch-site': 'same-site' }],
    ['a foreign Origin', { origin: 'https://evil.example' }],
  ])('blocks %s', async (_label, headers) => {
    const h = await harness();
    const { res, data } = await h.json<ApiErrorBody>('/api/bookings', validBooking(), { headers });
    expect(res.status).toBe(403);
    expect(data.error.code).toBe('cross_origin');
  });

  it('accepts a matching Origin when Sec-Fetch-Site is absent', async () => {
    const h = await harness();
    const { res } = await h.json('/api/bookings', validBooking(), {
      headers: { origin: 'https://scotfree.test' },
    });
    expect(res.status).toBe(201);
  });

  it('requires a JSON content type', async () => {
    const h = await harness();
    const res = await h.fetch('/api/bookings', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify(validBooking()),
    });
    expect(res.status).toBe(415);
  });

  it('rejects oversized bodies', async () => {
    const h = await harness();
    const { res } = await h.json<ApiErrorBody>(
      '/api/bookings',
      validBooking({ notes: 'x'.repeat(40_000) }),
    );
    expect(res.status).toBe(413);
  });

  it('rate-limits repeated requests from one IP', async () => {
    const h = await harness();
    const headers = { 'cf-connecting-ip': '203.0.113.9' };
    for (let i = 0; i < 10; i++) {
      const { res } = await h.json('/api/bookings', { turnstileToken: PASS_TOKEN }, { headers });
      expect(res.status).toBe(400);
    }
    const { res, data } = await h.json<ApiErrorBody>('/api/bookings', validBooking(), { headers });
    expect(res.status).toBe(429);
    expect(data.error.code).toBe('rate_limited');
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);

    // A different client is unaffected.
    const other = await h.json('/api/bookings', validBooking(), {
      headers: { 'cf-connecting-ip': '198.51.100.7' },
    });
    expect(other.res.status).toBe(201);

    const stored = await env.DB.prepare('SELECT key FROM rate_limits').all<{ key: string }>();
    expect(stored.results.every((r) => /^[0-9a-f]{64}$/.test(r.key))).toBe(true);
  });
});
