import { describe, expect, it } from 'vitest';
import {
  applicationRequestSchema,
  availabilityRuleSchema,
  bookingRequestSchema,
  contactRequestSchema,
  fieldErrors,
  normalizeUsPhone,
  quoteRequestSchema,
} from '../../src/shared/schemas';

const booking = {
  package: 'bundle',
  date: '2026-11-10',
  startTime: '16:00',
  name: '  Jordan Rivera ',
  email: ' Jordan@Example.EDU ',
  phone: '+1 (978) 555-0123',
  building: 'fulton',
  room: '214B',
  paymentPreference: 'cash',
  notes: '',
  agreePayment: true,
  agreePolicies: true,
  turnstileToken: 'token',
};

describe('normalizeUsPhone', () => {
  it.each([
    ['978-555-0123', '(978) 555-0123'],
    ['(978) 555 0123', '(978) 555-0123'],
    ['+1 978.555.0123', '(978) 555-0123'],
    ['19785550123', '(978) 555-0123'],
  ])('normalizes %j', (input, expected) => {
    expect(normalizeUsPhone(input)).toBe(expected);
  });

  it.each(['555-0123', '078-555-0123', '978-055-0123', '+44 20 7946 0958', 'call me'])(
    'rejects %j',
    (input) => {
      expect(normalizeUsPhone(input)).toBeNull();
    },
  );
});

describe('bookingRequestSchema', () => {
  it('trims, lowercases and normalizes valid input', () => {
    const result = bookingRequestSchema.parse(booking);
    expect(result).toMatchObject({
      name: 'Jordan Rivera',
      email: 'jordan@example.edu',
      phone: '(978) 555-0123',
      notes: undefined,
    });
  });

  it('requires both acknowledgements', () => {
    const result = bookingRequestSchema.safeParse({
      ...booking,
      agreePayment: false,
      agreePolicies: undefined,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(fieldErrors(result.error)).sort()).toEqual([
        'agreePayment',
        'agreePolicies',
      ]);
    }
  });

  it('blocks bathroom work in halls with communal bathrooms', () => {
    for (const pkg of ['bathroom', 'bundle']) {
      const result = bookingRequestSchema.safeParse({
        ...booking,
        package: pkg,
        building: 'wilson',
      });
      expect(result.success).toBe(false);
    }
    expect(
      bookingRequestSchema.safeParse({ ...booking, package: 'room', building: 'wilson' }).success,
    ).toBe(true);
  });

  it.each([
    ['an unknown building', { building: 'gordon-hall' }],
    ['a bad room number', { room: '<b>12</b>' }],
    ['an impossible date', { date: '2026-02-30' }],
    ['a 12-hour time', { startTime: '4:00 PM' }],
    ['an unknown package', { package: 'deluxe' }],
    ['a missing turnstile token', { turnstileToken: '' }],
    ['overlong notes', { notes: 'x'.repeat(501) }],
  ])('rejects %s', (_label, patch) => {
    expect(bookingRequestSchema.safeParse({ ...booking, ...patch }).success).toBe(false);
  });

  it('reports the first error per field with user-facing messages', () => {
    const result = bookingRequestSchema.safeParse({ ...booking, email: 'nope' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error)).toEqual({
        email: 'Enter a valid email address, like name@gordon.edu.',
      });
    }
  });
});

describe('quoteRequestSchema', () => {
  it('treats blank optional fields as absent', () => {
    const result = quoteRequestSchema.parse({
      name: 'Sam Lee',
      email: 'sam@example.edu',
      phone: '',
      building: 'chase',
      room: '',
      space: 'room',
      description: 'A detailed description of the mess.',
      preferredTiming: '   ',
      turnstileToken: 't',
    });
    expect(result.phone).toBeUndefined();
    expect(result.room).toBeUndefined();
    expect(result.preferredTiming).toBeUndefined();
  });
});

describe('applicationRequestSchema', () => {
  it('dedupes and orders availability and coerces hours', () => {
    const result = applicationRequestSchema.parse({
      name: 'Avery Chen',
      email: 'avery@example.edu',
      phone: '9785550144',
      classYear: 'senior',
      availability: ['sat', 'mon', 'sat'],
      hoursPerWeek: '10',
      motivation: 'Reliable, careful, and I need flexible hours.',
      agreeTerms: true,
      turnstileToken: 't',
    });
    expect(result.availability).toEqual(['mon', 'sat']);
    expect(result.hoursPerWeek).toBe(10);
  });
});

describe('contactRequestSchema', () => {
  it('uppercases booking references and allows them to be blank', () => {
    const base = {
      name: 'Riley Park',
      email: 'r@example.edu',
      topic: 'cancel',
      message: 'Please cancel my booking.',
      turnstileToken: 't',
    };
    expect(
      contactRequestSchema.parse({ ...base, bookingReference: 'sf-abcdef' }).bookingReference,
    ).toBe('SF-ABCDEF');
    expect(
      contactRequestSchema.parse({ ...base, bookingReference: '' }).bookingReference,
    ).toBeUndefined();
    // "O", "I", "L", "U", "0" and "1" never appear in references.
    expect(contactRequestSchema.safeParse({ ...base, bookingReference: 'SF-ABCDE0' }).success).toBe(
      false,
    );
  });
});

describe('availabilityRuleSchema', () => {
  it('requires the end time to be after the start time', () => {
    expect(
      availabilityRuleSchema.safeParse({
        weekday: 1,
        startTime: '18:00',
        endTime: '16:00',
        capacity: 1,
      }).success,
    ).toBe(false);
    expect(
      availabilityRuleSchema.parse({
        weekday: '1',
        startTime: '16:00',
        endTime: '18:00',
        capacity: '2',
      }),
    ).toEqual({
      weekday: 1,
      startTime: '16:00',
      endTime: '18:00',
      capacity: 2,
      active: true,
    });
  });
});
