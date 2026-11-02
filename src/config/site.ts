/**
 * Every business constant lives here (AGENTS.md → Coding standards).
 * Isomorphic: imported by Astro pages, Preact islands and the Workers API.
 * See `.claude/skills/update-business-content/SKILL.md` before editing.
 */

export const site = {
  name: 'Scot-Free Cleaning',
  shortName: 'Scot-Free',
  tagline: 'Pass inspection. Skip the fine.',
  description:
    'Affordable, student-run room and bathroom cleaning for Gordon College residents. Book a cleaning slot online and pay in person with cash or Venmo.',
  timeZone: 'America/New_York',
  locale: 'en-US',
  disclaimer:
    'Scot-Free Cleaning is an independent, student-run business. It is not affiliated with, endorsed by, or sponsored by Gordon College.',
  contact: {
    // PLAN.md blocker B1: replace with real details, then set isPlaceholder to false.
    // 555-01xx numbers are reserved for fiction and can never reach a real person.
    isPlaceholder: true,
    email: 'hello@example.com',
    phoneDisplay: '(555) 010-0199',
    phoneE164: '+15550100199',
    venmoHandle: '@ScotFree-Cleaning',
    responseTime: 'We usually reply within one business day.',
  },
} as const;

export type PackageId = 'room' | 'bathroom' | 'bundle';

export interface ServicePackage {
  id: PackageId;
  name: string;
  priceCents: number;
  duration: string;
  summary: string;
  includes: readonly string[];
  requiresPrivateBathroom: boolean;
}

/** Cleaners receive this share of each job's price (spec: 75% commission split). */
export const commissionRate = 0.75;

export const packages: readonly ServicePackage[] = [
  {
    id: 'room',
    name: 'Room Clean',
    priceCents: 3000,
    duration: 'About 45–60 minutes',
    summary: 'Your bedroom, inspection-ready: floors, surfaces, trash and dust.',
    includes: [
      'Vacuum or sweep and mop all floors, including under the bed and desk',
      'Dust and wipe desks, dressers, shelves, windowsills and baseboards',
      'Empty trash and recycling and clear out take-out containers',
      'Wipe light switches, door handles and mini-fridge exterior',
      'Clean mirrors and interior glass',
      'Final walkthrough against our inspection checklist',
    ],
    requiresPrivateBathroom: false,
  },
  {
    id: 'bathroom',
    name: 'Bathroom Clean',
    priceCents: 4000,
    duration: 'About 45–60 minutes',
    summary: 'A deep scrub of your suite or apartment bathroom to inspection standard.',
    includes: [
      'Scrub shower or tub walls, floor, grout and fixtures; remove soap scum and mildew',
      'Clean and disinfect the toilet inside and out, including the base and behind it',
      'Scrub sink, counter and faucet; polish mirror streak-free',
      'Sweep and mop the floor, including corners and behind the door',
      'Empty bathroom trash and wipe cabinet fronts',
      'Final walkthrough against our inspection checklist',
    ],
    requiresPrivateBathroom: true,
  },
  {
    id: 'bundle',
    name: 'Room + Bathroom',
    priceCents: 6000,
    duration: 'About 1.5–2 hours',
    summary: 'Both packages in one visit. Save $10 compared with booking them separately.',
    includes: [
      'Everything in the Room Clean',
      'Everything in the Bathroom Clean',
      'One visit, one checklist, one payment',
    ],
    requiresPrivateBathroom: true,
  },
] as const;

export type BathroomType = 'communal' | 'suite' | 'apartment' | 'varies';

export interface Building {
  id: string;
  name: string;
  bathroomType: BathroomType;
}

/**
 * Residence halls listed on gordon.edu/life/residence-life-dining/residence-halls (verified 2026-11-02).
 * Buildings with communal floor bathrooms can't book bathroom packages (ADR 0011).
 */
export const buildings: readonly Building[] = [
  { id: 'bromley', name: 'Bromley Hall', bathroomType: 'apartment' },
  { id: 'chase', name: 'Chase Hall', bathroomType: 'suite' },
  { id: 'evans', name: 'Evans Hall', bathroomType: 'communal' },
  { id: 'ferrin', name: 'Ferrin Hall', bathroomType: 'communal' },
  { id: 'fulton', name: 'Fulton Hall', bathroomType: 'suite' },
  { id: 'nyland', name: 'Nyland Hall', bathroomType: 'communal' },
  { id: 'tavilla', name: 'Tavilla Hall', bathroomType: 'apartment' },
  { id: 'village', name: 'The Village', bathroomType: 'varies' },
  { id: 'wilson', name: 'Wilson Hall', bathroomType: 'communal' },
] as const;

export const bookingRules = {
  /** Earliest bookable window starts at least this many hours from now. */
  minLeadHours: 12,
  /** Latest bookable date, counted in days from today (campus time). */
  horizonDays: 28,
  /** Maximum number of pending/confirmed future bookings per email address. */
  maxActivePerEmail: 3,
  /** Notice required for free cancellation or rescheduling (ADR 0011). */
  cancellationNoticeHours: 24,
} as const;

export const paymentMethods = ['cash', 'venmo'] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export const uploadRules = {
  maxFiles: 5,
  maxFileBytes: 10 * 1024 * 1024,
  maxTotalBytes: 30 * 1024 * 1024,
  /** Content types we accept after sniffing magic bytes. */
  acceptedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const,
  retentionDays: 90,
} as const;

export const quoteSpaces = ['room', 'bathroom', 'both', 'other'] as const;
export type QuoteSpace = (typeof quoteSpaces)[number];

export const classYears = ['first-year', 'sophomore', 'junior', 'senior', 'other'] as const;
export type ClassYear = (typeof classYears)[number];

export const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type WeekdayKey = (typeof weekdays)[number];

export const contactTopics = ['general', 'reschedule', 'cancel', 'feedback', 'other'] as const;
export type ContactTopic = (typeof contactTopics)[number];
export const contactTopicLabels: Readonly<Record<ContactTopic, string>> = {
  general: 'General question',
  reschedule: 'Reschedule a booking',
  cancel: 'Cancel a booking',
  feedback: 'Feedback',
  other: 'Something else',
};

export const bookingStatuses = [
  'pending',
  'confirmed',
  'completed',
  'cancelled',
  'no_show',
] as const;
export type BookingStatus = (typeof bookingStatuses)[number];
/** Statuses that hold a spot in a cleaning window. */
export const activeBookingStatuses: readonly BookingStatus[] = ['pending', 'confirmed'];

export const quoteStatuses = ['new', 'quoted', 'booked', 'declined', 'closed'] as const;
export type QuoteStatus = (typeof quoteStatuses)[number];

export const applicationStatuses = ['new', 'interviewing', 'hired', 'declined'] as const;
export type ApplicationStatus = (typeof applicationStatuses)[number];

export const messageStatuses = ['new', 'handled'] as const;
export type MessageStatus = (typeof messageStatuses)[number];

/** Per-IP request budgets for public mutations (ADR 0006). */
export const rateLimits = {
  booking: { limit: 10, windowSeconds: 3600 },
  quote: { limit: 5, windowSeconds: 3600 },
  application: { limit: 5, windowSeconds: 3600 },
  contact: { limit: 10, windowSeconds: 3600 },
} as const;
export type RateLimitBucket = keyof typeof rateLimits;

export function getPackage(id: PackageId): ServicePackage {
  const pkg = packages.find((p) => p.id === id);
  if (!pkg) throw new Error(`Unknown package: ${id}`);
  return pkg;
}

export function getBuilding(id: string): Building | undefined {
  return buildings.find((b) => b.id === id);
}

/** Display name for a building id, falling back to the raw id for unknown values. */
export function buildingName(id: string): string {
  return getBuilding(id)?.name ?? id;
}

/** Whether a package can be booked for a building (no bathroom work in communal-bathroom halls). */
export function isPackageAllowedInBuilding(packageId: PackageId, buildingId: string): boolean {
  const building = getBuilding(buildingId);
  if (!building) return false;
  return !(getPackage(packageId).requiresPrivateBathroom && building.bathroomType === 'communal');
}
