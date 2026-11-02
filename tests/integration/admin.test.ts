import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type {
  AdminAvailability,
  AdminBooking,
  AdminQuote,
  AdminScheduleWindow,
  AdminSummary,
  ApiErrorBody,
  BookingCreatedResponse,
  ListResponse,
} from '../../src/shared/api-types';
import type { AvailabilityRule } from '../../src/shared/availability';
import {
  accessToken,
  ADMIN_EMAIL,
  harness,
  jpegBytes,
  PASS_TOKEN,
  validBooking,
  type TestHarness,
} from './helpers';

async function adminFetch(h: TestHarness, path: string, init: RequestInit = {}, token?: string) {
  const headers = new Headers(init.headers);
  headers.set('cf-access-jwt-assertion', token ?? (await accessToken()));
  if (init.body !== undefined) headers.set('content-type', 'application/json');
  return h.fetch(path, { ...init, headers });
}

describe('admin authentication', () => {
  it('rejects requests without a token', async () => {
    const h = await harness();
    const res = await h.fetch('/api/admin/me');
    expect(res.status).toBe(401);
  });

  it.each([
    ['a wrong audience', { aud: 'other-app' }],
    ['a wrong issuer', { iss: 'https://evil.cloudflareaccess.com' }],
    ['an expired token', { expiresIn: '-10m' }],
  ])('rejects %s', async (_label, claims) => {
    const h = await harness();
    const res = await adminFetch(h, '/api/admin/me', {}, await accessToken(claims));
    expect(res.status).toBe(401);
  });

  it('rejects a garbage token', async () => {
    const h = await harness();
    const res = await adminFetch(h, '/api/admin/me', {}, 'not.a.jwt');
    expect(res.status).toBe(401);
  });

  it('rejects a valid token for an email not on the allowlist', async () => {
    const h = await harness();
    const res = await adminFetch(
      h,
      '/api/admin/me',
      {},
      await accessToken({ email: 'intruder@example.com' }),
    );
    expect(res.status).toBe(403);
  });

  it('accepts a valid token from the CF_Authorization cookie', async () => {
    const h = await harness();
    const res = await h.fetch('/api/admin/me', {
      headers: { cookie: `CF_Authorization=${await accessToken()}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: ADMIN_EMAIL });
  });

  it('fails closed when Access is not configured', async () => {
    const h = await harness({ deps: { access: () => null } });
    const res = await adminFetch(h, '/api/admin/me');
    expect(res.status).toBe(503);
    expect(((await res.json()) as ApiErrorBody).error.code).toBe('admin_not_configured');
  });

  it('fails closed when the admin allowlist is empty', async () => {
    const h = await harness({ env: { ADMIN_EMAILS: '' } });
    expect((await adminFetch(h, '/api/admin/me')).status).toBe(503);
  });

  it('only honors the dev bypass in the development environment', async () => {
    const dev = await harness({
      env: { ENVIRONMENT: 'development', DEV_ADMIN_EMAIL: 'Dev@Example.com' },
    });
    const devRes = await dev.fetch('/api/admin/me');
    expect(await devRes.json()).toEqual({ email: 'dev@example.com' });

    for (const environment of ['production', 'preview', 'test', 'garbage']) {
      const h = await harness({
        env: { ENVIRONMENT: environment, DEV_ADMIN_EMAIL: 'dev@example.com' },
      });
      expect((await h.fetch('/api/admin/me')).status).toBe(401);
    }
  });

  it('requires same-origin for admin mutations even with a valid token', async () => {
    const h = await harness();
    const res = await adminFetch(h, '/api/admin/messages/abc', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'handled' }),
      headers: { 'sec-fetch-site': 'cross-site' },
    });
    expect(res.status).toBe(403);
  });
});

describe('admin bookings', () => {
  it('lists bookings, updates status and notes, and writes an audit entry', async () => {
    const h = await harness();
    const created = await h.json<BookingCreatedResponse>('/api/bookings', validBooking());

    const list = (await (
      await adminFetch(h, '/api/admin/bookings?from=2026-11-01')
    ).json()) as ListResponse<AdminBooking>;
    expect(list.items).toHaveLength(1);
    const booking = list.items[0];
    expect(booking).toMatchObject({
      reference: created.data.reference,
      status: 'pending',
      name: 'Jordan Rivera',
    });

    const res = await adminFetch(h, `/api/admin/bookings/${booking?.id ?? ''}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'confirmed', adminNotes: 'Assigned to Casey' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: 'confirmed',
      adminNotes: 'Assigned to Casey',
    });

    const audit = await env.DB.prepare(
      'SELECT actor, action, entity_id, details FROM audit_log',
    ).first();
    expect(audit).toEqual({
      actor: ADMIN_EMAIL,
      action: 'booking.update',
      entity_id: booking?.id,
      details: '{"status":"confirmed","notesChanged":true}',
    });
  });

  it('frees capacity when a booking is cancelled', async () => {
    const h = await harness();
    const first = await h.json<BookingCreatedResponse>(
      '/api/bookings',
      validBooking({ email: 'a@example.edu' }),
    );
    await h.json('/api/bookings', validBooking({ email: 'b@example.edu' }));
    expect(
      (await h.json('/api/bookings', validBooking({ email: 'c@example.edu' }))).res.status,
    ).toBe(409);

    const row = await env.DB.prepare('SELECT id FROM bookings WHERE reference = ?1')
      .bind(first.data.reference)
      .first<{ id: string }>();
    await adminFetch(h, `/api/admin/bookings/${row?.id ?? ''}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelled' }),
    });
    expect(
      (await h.json('/api/bookings', validBooking({ email: 'c@example.edu' }))).res.status,
    ).toBe(201);
  });

  it('refuses to restore a cancelled booking into a window that has since filled', async () => {
    const h = await harness();
    const first = await h.json<BookingCreatedResponse>(
      '/api/bookings',
      validBooking({ email: 'a@example.edu' }),
    );
    const row = await env.DB.prepare('SELECT id FROM bookings WHERE reference = ?1')
      .bind(first.data.reference)
      .first<{ id: string }>();
    const id = row?.id ?? '';
    await adminFetch(h, `/api/admin/bookings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelled' }),
    });
    await h.json('/api/bookings', validBooking({ email: 'b@example.edu' }));
    await h.json('/api/bookings', validBooking({ email: 'c@example.edu' }));

    const restore = await adminFetch(h, `/api/admin/bookings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'pending' }),
    });
    expect(restore.status).toBe(409);
    expect(((await restore.json()) as ApiErrorBody).error.code).toBe('slot_full');

    // Notes-only edits on an inactive booking are still allowed.
    const notes = await adminFetch(h, `/api/admin/bookings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ adminNotes: 'Asked to rebook' }),
    });
    expect(notes.status).toBe(200);
  });

  it('returns 404 for an unknown booking and 400 for an empty patch', async () => {
    const h = await harness();
    const missing = await adminFetch(h, '/api/admin/bookings/does-not-exist', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'confirmed' }),
    });
    expect(missing.status).toBe(404);
    const empty = await adminFetch(h, '/api/admin/bookings/x', { method: 'PATCH', body: '{}' });
    expect(empty.status).toBe(400);
  });

  it('summarizes the dashboard counts', async () => {
    const h = await harness();
    await h.json('/api/bookings', validBooking());
    await h.json('/api/contact', {
      name: 'Riley Park',
      email: 'riley@example.edu',
      topic: 'general',
      message: 'Do you clean during finals week?',
      turnstileToken: PASS_TOKEN,
    });
    const summary = (await (await adminFetch(h, '/api/admin/summary')).json()) as AdminSummary;
    expect(summary).toEqual({
      today: '2026-11-02',
      pendingBookings: 1,
      upcomingBookings: 1,
      newQuotes: 0,
      newApplications: 0,
      newMessages: 1,
    });
  });
});

describe('admin availability', () => {
  it('manages weekly rules with conflict detection', async () => {
    const h = await harness();
    const initial = (await (
      await adminFetch(h, '/api/admin/availability')
    ).json()) as AdminAvailability;
    expect(initial.rules).toHaveLength(15);

    const create = await adminFetch(h, '/api/admin/availability/rules', {
      method: 'POST',
      body: JSON.stringify({ weekday: 1, startTime: '12:00', endTime: '14:00', capacity: 3 }),
    });
    expect(create.status).toBe(201);
    const rule = (await create.json()) as AvailabilityRule;
    expect(rule).toMatchObject({ weekday: 1, capacity: 3, active: true });

    const duplicate = await adminFetch(h, '/api/admin/availability/rules', {
      method: 'POST',
      body: JSON.stringify({ weekday: 1, startTime: '12:00', endTime: '13:00', capacity: 1 }),
    });
    expect(duplicate.status).toBe(409);

    const invalid = await adminFetch(h, '/api/admin/availability/rules', {
      method: 'POST',
      body: JSON.stringify({ weekday: 1, startTime: '15:00', endTime: '14:00', capacity: 1 }),
    });
    expect(invalid.status).toBe(400);

    const update = await adminFetch(h, `/api/admin/availability/rules/${rule.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        weekday: 1,
        startTime: '12:00',
        endTime: '14:00',
        capacity: 1,
        active: false,
      }),
    });
    expect(await update.json()).toMatchObject({ capacity: 1, active: false });

    expect(
      (await adminFetch(h, `/api/admin/availability/rules/${rule.id}`, { method: 'DELETE' }))
        .status,
    ).toBe(200);
    expect(
      (await adminFetch(h, `/api/admin/availability/rules/${rule.id}`, { method: 'DELETE' }))
        .status,
    ).toBe(404);
  });

  it('adds overrides and closures that change public availability', async () => {
    const h = await harness();
    await adminFetch(h, '/api/admin/availability/overrides', {
      method: 'POST',
      body: JSON.stringify({
        date: '2026-11-03',
        startTime: '16:00',
        endTime: '18:00',
        capacity: 5,
        note: 'Inspection week',
      }),
    });
    await adminFetch(h, '/api/admin/availability/closures', {
      method: 'POST',
      body: JSON.stringify({ date: '2026-11-04', reason: 'Owner away' }),
    });
    const schedule = (await (
      await adminFetch(h, '/api/admin/schedule?from=2026-11-03&days=2')
    ).json()) as ListResponse<AdminScheduleWindow>;
    expect(schedule.items).toEqual([
      {
        date: '2026-11-03',
        startTime: '16:00',
        endTime: '18:00',
        capacity: 5,
        booked: 0,
        source: 'override',
      },
      {
        date: '2026-11-03',
        startTime: '18:00',
        endTime: '20:00',
        capacity: 2,
        booked: 0,
        source: 'rule',
      },
    ]);

    const availability = (await (
      await adminFetch(h, '/api/admin/availability')
    ).json()) as AdminAvailability;
    expect(availability.closures).toEqual([{ date: '2026-11-04', reason: 'Owner away' }]);
    const overrideId = availability.overrides[0]?.id ?? '';
    expect(
      (await adminFetch(h, `/api/admin/availability/overrides/${overrideId}`, { method: 'DELETE' }))
        .status,
    ).toBe(200);
    expect(
      (await adminFetch(h, '/api/admin/availability/closures/2026-11-04', { method: 'DELETE' }))
        .status,
    ).toBe(200);
  });
});

describe('admin quotes, applications and messages', () => {
  it('lists quotes with photos and streams a photo with a sandboxed CSP', async () => {
    const h = await harness();
    const form = new FormData();
    for (const [k, v] of Object.entries({
      name: 'Sam Lee',
      email: 'sam@example.edu',
      building: 'chase',
      space: 'bathroom',
      description: 'Shower grout needs serious attention before inspection.',
      turnstileToken: PASS_TOKEN,
    })) {
      form.set(k, v);
    }
    form.append('photos', new Blob([jpegBytes(4096)], { type: 'image/jpeg' }), 'a.jpg');
    expect((await h.fetch('/api/quotes', { method: 'POST', body: form })).status).toBe(201);

    const { items } = (await (
      await adminFetch(h, '/api/admin/quotes?status=new')
    ).json()) as ListResponse<AdminQuote>;
    expect(items).toHaveLength(1);
    const quote = items[0];
    expect(quote?.photos).toEqual([
      { id: expect.any(String), contentType: 'image/jpeg', sizeBytes: 4096 },
    ]);

    const photoRes = await adminFetch(
      h,
      `/api/admin/quotes/${quote?.id ?? ''}/photos/${quote?.photos[0]?.id ?? ''}`,
    );
    expect(photoRes.status).toBe(200);
    expect(photoRes.headers.get('content-type')).toBe('image/jpeg');
    expect(photoRes.headers.get('content-security-policy')).toContain('sandbox');
    expect((await photoRes.arrayBuffer()).byteLength).toBe(4096);

    // A photo id from another quote must not be reachable through this quote.
    expect(
      (await adminFetch(h, `/api/admin/quotes/other-quote/photos/${quote?.photos[0]?.id ?? ''}`))
        .status,
    ).toBe(404);

    // Once the lifecycle rule deletes the object, the API reports it as expired.
    const key = await env.DB.prepare('SELECT r2_key FROM quote_photos').first<{ r2_key: string }>();
    await env.UPLOADS.delete(key?.r2_key ?? '');
    expect(
      (
        await adminFetch(
          h,
          `/api/admin/quotes/${quote?.id ?? ''}/photos/${quote?.photos[0]?.id ?? ''}`,
        )
      ).status,
    ).toBe(410);

    const patch = await adminFetch(h, `/api/admin/quotes/${quote?.id ?? ''}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'quoted', quotedCents: 7500 }),
    });
    expect(patch.status).toBe(200);
    const quoted = (await (
      await adminFetch(h, '/api/admin/quotes')
    ).json()) as ListResponse<AdminQuote>;
    expect(quoted.items[0]).toMatchObject({ status: 'quoted', quotedCents: 7500 });
  });

  it('rejects an unknown status filter', async () => {
    const h = await harness();
    expect((await adminFetch(h, '/api/admin/quotes?status=bogus')).status).toBe(400);
  });

  it('updates application and message statuses', async () => {
    const h = await harness();
    await h.json('/api/applications', {
      name: 'Avery Chen',
      email: 'avery@example.edu',
      phone: '978-555-0144',
      classYear: 'junior',
      availability: ['tue'],
      hoursPerWeek: 4,
      motivation: 'Flexible work that fits around my classes.',
      agreeTerms: true,
      turnstileToken: PASS_TOKEN,
    });
    const apps = (await (await adminFetch(h, '/api/admin/applications')).json()) as ListResponse<{
      id: string;
      availability: string[];
    }>;
    expect(apps.items[0]?.availability).toEqual(['tue']);
    const res = await adminFetch(h, `/api/admin/applications/${apps.items[0]?.id ?? ''}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'interviewing' }),
    });
    expect(res.status).toBe(200);

    const bad = await adminFetch(h, '/api/admin/messages/x', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'archived' }),
    });
    expect(bad.status).toBe(400);
  });
});
