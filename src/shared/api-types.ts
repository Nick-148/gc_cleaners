/** Response shapes shared by the API and its clients. */
import type {
  ApplicationStatus,
  BookingStatus,
  ClassYear,
  ContactTopic,
  MessageStatus,
  PackageId,
  PaymentMethod,
  QuoteSpace,
  QuoteStatus,
  WeekdayKey,
} from '../config/site';
import type { AvailabilityRule, BookableDay, Closure, WindowOverride } from './availability';
import type { ClockTime, IsoDate } from './dates';

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
    requestId?: string;
  };
}

export interface SlotsResponse {
  timeZone: string;
  days: BookableDay[];
}

export interface BookingCreatedResponse {
  reference: string;
  package: PackageId;
  date: IsoDate;
  startTime: ClockTime;
  endTime: ClockTime;
  priceCents: number;
}

export interface ReferenceResponse {
  reference: string;
}

export interface OkResponse {
  ok: true;
}

export interface ListResponse<T> {
  items: T[];
}

// ---------- admin ----------

export interface AdminMe {
  email: string;
}

export interface AdminSummary {
  today: IsoDate;
  pendingBookings: number;
  upcomingBookings: number;
  newQuotes: number;
  newApplications: number;
  newMessages: number;
}

export interface AdminBooking {
  id: string;
  reference: string;
  status: BookingStatus;
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
  notes: string | null;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminQuotePhoto {
  id: string;
  contentType: string;
  sizeBytes: number;
}

export interface AdminQuote {
  id: string;
  reference: string;
  status: QuoteStatus;
  name: string;
  email: string;
  phone: string | null;
  building: string;
  room: string | null;
  space: QuoteSpace;
  description: string;
  preferredTiming: string | null;
  quotedCents: number | null;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
  photos: AdminQuotePhoto[];
}

export interface AdminApplication {
  id: string;
  status: ApplicationStatus;
  name: string;
  email: string;
  phone: string;
  classYear: ClassYear;
  availability: WeekdayKey[];
  hoursPerWeek: number;
  experience: string | null;
  motivation: string;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminMessage {
  id: string;
  status: MessageStatus;
  name: string;
  email: string;
  phone: string | null;
  topic: ContactTopic;
  bookingReference: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAvailability {
  rules: AvailabilityRule[];
  overrides: WindowOverride[];
  closures: Closure[];
}

/** One window with its booked count, for the admin schedule view. */
export interface AdminScheduleWindow {
  date: IsoDate;
  startTime: ClockTime;
  endTime: ClockTime;
  capacity: number;
  booked: number;
  source: 'rule' | 'override';
}
