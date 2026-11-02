/**
 * Request validation shared by browser forms and the API (AGENTS.md: validate at the boundary).
 * Error messages are user-facing: plain, specific and actionable.
 */
import { z } from 'zod';
import {
  applicationStatuses,
  bookingRules,
  bookingStatuses,
  buildings,
  classYears,
  contactTopics,
  isPackageAllowedInBuilding,
  messageStatuses,
  paymentMethods,
  quoteSpaces,
  quoteStatuses,
  weekdays,
} from '../config/site';
import { isValidClockTime, isValidIsoDate, minutesOf } from './dates';

// ---------- field building blocks ----------

const buildingIds = buildings.map((b) => b.id) as [string, ...string[]];

/** Turns '' into undefined so optional fields left blank aren't stored as empty strings. */
const blankToUndefined = (v: string | undefined): string | undefined =>
  v === undefined || v === '' ? undefined : v;

export const nameField = z
  .string({ error: 'Enter your name.' })
  .trim()
  .min(2, { error: 'Enter your full name.' })
  .max(80, { error: 'Name must be 80 characters or fewer.' });

export const emailField = z
  .string({ error: 'Enter your email address.' })
  .trim()
  .toLowerCase()
  .max(254, { error: 'Email must be 254 characters or fewer.' })
  .pipe(z.email({ error: 'Enter a valid email address, like name@gordon.edu.' }));

/** US phone numbers, normalized to "(978) 555-0123". */
export function normalizeUsPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(ten)) return null;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

export const phoneField = z
  .string({ error: 'Enter your phone number.' })
  .trim()
  .max(30, { error: 'Enter a valid US phone number.' })
  .transform((v, ctx) => {
    const normalized = normalizeUsPhone(v);
    if (normalized === null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Enter a valid US phone number, like 978-555-0123.',
      });
      return z.NEVER;
    }
    return normalized;
  });

const optionalPhoneField = z
  .string()
  .trim()
  .max(30, { error: 'Enter a valid US phone number.' })
  .optional()
  .transform((v, ctx) => {
    if (v === undefined || v === '') return undefined;
    const normalized = normalizeUsPhone(v);
    if (normalized === null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Enter a valid US phone number, like 978-555-0123.',
      });
      return z.NEVER;
    }
    return normalized;
  });

export const buildingField = z.enum(buildingIds, { error: 'Choose your residence hall.' });

export const roomField = z
  .string({ error: 'Enter your room number.' })
  .trim()
  .min(1, { error: 'Enter your room number.' })
  .max(20, { error: 'Room number must be 20 characters or fewer.' })
  .regex(/^[A-Za-z0-9 .#/-]+$/, { error: 'Use letters, numbers, spaces, # . / or - only.' });

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, { error: `${label} must be ${max} characters or fewer.` })
    .optional()
    .transform(blankToUndefined);

const requiredText = (min: number, max: number, label: string) =>
  z
    .string({ error: `Enter ${label.toLowerCase()}.` })
    .trim()
    .min(min, { error: `${label} must be at least ${min} characters.` })
    .max(max, { error: `${label} must be ${max} characters or fewer.` });

export const isoDateField = z
  .string({ error: 'Choose a date.' })
  .refine(isValidIsoDate, { error: 'Choose a valid date.' });

export const clockTimeField = z
  .string({ error: 'Choose a time.' })
  .refine(isValidClockTime, { error: 'Use a 24-hour time like 16:00.' });

const turnstileField = z
  .string({ error: 'Please complete the verification check.' })
  .min(1, { error: 'Please complete the verification check.' })
  .max(2048);

/** Honeypot: humans never see this field. Anything in it marks the submission as a bot. */
const honeypotField = z.string().max(500).optional();

export const bookingReferenceField = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^SF-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$/, {
    error: 'Booking references look like SF-7K2Q9M.',
  });

// ---------- public requests ----------

export const bookingRequestSchema = z
  .object({
    package: z.enum(['room', 'bathroom', 'bundle'], { error: 'Choose a cleaning package.' }),
    date: isoDateField,
    startTime: clockTimeField,
    name: nameField,
    email: emailField,
    phone: phoneField,
    building: buildingField,
    room: roomField,
    paymentPreference: z.enum(paymentMethods, { error: 'Choose cash or Venmo.' }),
    notes: optionalText(500, 'Notes'),
    agreePayment: z.literal(true, {
      error: 'Please confirm you will pay in person with cash or Venmo.',
    }),
    agreePolicies: z.literal(true, {
      error: 'Please confirm you have read the visit and cancellation policy.',
    }),
    turnstileToken: turnstileField,
    company: honeypotField,
  })
  .superRefine((value, ctx) => {
    if (!isPackageAllowedInBuilding(value.package, value.building)) {
      ctx.addIssue({
        code: 'custom',
        path: ['package'],
        message:
          'This hall has shared floor bathrooms, which the college maintains. Choose the Room Clean package instead.',
      });
    }
  });
export type BookingRequest = z.output<typeof bookingRequestSchema>;
export type BookingRequestInput = z.input<typeof bookingRequestSchema>;

/** Text fields of the multipart quote request. Photos are validated separately (uploads service). */
export const quoteRequestSchema = z.object({
  name: nameField,
  email: emailField,
  phone: optionalPhoneField,
  building: buildingField,
  room: z
    .string()
    .trim()
    .max(20, { error: 'Room number must be 20 characters or fewer.' })
    .regex(/^[A-Za-z0-9 .#/-]*$/, { error: 'Use letters, numbers, spaces, # . / or - only.' })
    .optional()
    .transform(blankToUndefined),
  space: z.enum(quoteSpaces, { error: 'Choose what needs cleaning.' }),
  description: requiredText(20, 2000, 'Description'),
  preferredTiming: optionalText(200, 'Preferred timing'),
  turnstileToken: turnstileField,
  company: honeypotField,
});
export type QuoteRequest = z.output<typeof quoteRequestSchema>;

export const applicationRequestSchema = z.object({
  name: nameField,
  email: emailField,
  phone: phoneField,
  classYear: z.enum(classYears, { error: 'Choose your class year.' }),
  availability: z
    .array(z.enum(weekdays), { error: 'Choose at least one day you can work.' })
    .min(1, { error: 'Choose at least one day you can work.' })
    .max(7)
    .transform((days) => weekdays.filter((d) => days.includes(d))),
  hoursPerWeek: z.coerce
    .number({ error: 'Enter how many hours a week you can work.' })
    .int({ error: 'Enter a whole number of hours.' })
    .min(1, { error: 'Enter at least 1 hour.' })
    .max(40, { error: 'Enter 40 hours or fewer.' }),
  experience: optionalText(1500, 'Experience'),
  motivation: requiredText(20, 1500, 'Your answer'),
  agreeTerms: z.literal(true, {
    error: 'Please confirm you understand how pay and scheduling work.',
  }),
  turnstileToken: turnstileField,
  company: honeypotField,
});
export type ApplicationRequest = z.output<typeof applicationRequestSchema>;
export type ApplicationRequestInput = z.input<typeof applicationRequestSchema>;

export const contactRequestSchema = z.object({
  name: nameField,
  email: emailField,
  phone: optionalPhoneField,
  topic: z.enum(contactTopics, { error: 'Choose a topic.' }),
  bookingReference: z
    .string()
    .trim()
    .optional()
    .transform(blankToUndefined)
    .pipe(bookingReferenceField.optional()),
  message: requiredText(10, 3000, 'Message'),
  turnstileToken: turnstileField,
  company: honeypotField,
});
export type ContactRequest = z.output<typeof contactRequestSchema>;
export type ContactRequestInput = z.input<typeof contactRequestSchema>;

export const slotsQuerySchema = z.object({
  from: isoDateField.optional(),
  days: z.coerce
    .number()
    .int()
    .min(1)
    .max(bookingRules.horizonDays + 1)
    .default(14),
});

// ---------- admin requests ----------

const adminNotesField = z
  .string()
  .trim()
  .max(2000, { error: 'Notes must be 2000 characters or fewer.' })
  .nullable()
  .optional();

const atLeastOneField = (value: Record<string, unknown>): boolean =>
  Object.values(value).some((v) => v !== undefined);

export const bookingUpdateSchema = z
  .object({ status: z.enum(bookingStatuses).optional(), adminNotes: adminNotesField })
  .refine(atLeastOneField, { error: 'Nothing to update.' });

const windowShape = {
  startTime: clockTimeField,
  endTime: clockTimeField,
  capacity: z.coerce.number().int().min(0).max(50),
};

const startBeforeEnd = (v: { startTime: string; endTime: string }): boolean =>
  !isValidClockTime(v.startTime) ||
  !isValidClockTime(v.endTime) ||
  minutesOf(v.startTime) < minutesOf(v.endTime);

export const availabilityRuleSchema = z
  .object({
    weekday: z.coerce.number().int().min(0).max(6),
    ...windowShape,
    active: z.boolean().default(true),
  })
  .refine(startBeforeEnd, { error: 'End time must be after start time.', path: ['endTime'] });
export type AvailabilityRuleInput = z.output<typeof availabilityRuleSchema>;

export const windowOverrideSchema = z
  .object({
    date: isoDateField,
    ...windowShape,
    note: optionalText(200, 'Note'),
  })
  .refine(startBeforeEnd, { error: 'End time must be after start time.', path: ['endTime'] });
export type WindowOverrideInput = z.output<typeof windowOverrideSchema>;

export const closureSchema = z.object({
  date: isoDateField,
  reason: optionalText(200, 'Reason'),
});
export type ClosureInput = z.output<typeof closureSchema>;

export const quoteUpdateSchema = z
  .object({
    status: z.enum(quoteStatuses).optional(),
    quotedCents: z.coerce.number().int().min(0).max(100_000).nullable().optional(),
    adminNotes: adminNotesField,
  })
  .refine(atLeastOneField, { error: 'Nothing to update.' });

export const applicationUpdateSchema = z
  .object({ status: z.enum(applicationStatuses).optional(), adminNotes: adminNotesField })
  .refine(atLeastOneField, { error: 'Nothing to update.' });

export const messageUpdateSchema = z.object({ status: z.enum(messageStatuses) });

export const adminListQuerySchema = z.object({
  status: z.string().max(20).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

export const adminBookingsQuerySchema = adminListQuerySchema.extend({
  from: isoDateField.optional(),
  to: isoDateField.optional(),
  status: z.enum(bookingStatuses).optional(),
});

/** Flattened field errors for forms: { field: firstMessage }. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : '_form';
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
