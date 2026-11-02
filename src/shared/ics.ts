/** Minimal RFC 5545 calendar event for "Add to calendar" after booking. Times are emitted in UTC. */
import { zonedTimeToInstant, type ClockTime, type IsoDate } from './dates';

function icsTimestamp(instant: Date): string {
  return instant
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/** Escapes TEXT values per RFC 5545 §3.3.11. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

export function buildIcsEvent(event: {
  uid: string;
  date: IsoDate;
  startTime: ClockTime;
  endTime: ClockTime;
  timeZone: string;
  summary: string;
  description: string;
  location: string;
  now: Date;
}): string {
  const start = zonedTimeToInstant(event.date, event.startTime, event.timeZone);
  const end = zonedTimeToInstant(event.date, event.endTime, event.timeZone);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Scot-Free Cleaning//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeText(event.uid)}`,
    `DTSTAMP:${icsTimestamp(event.now)}`,
    `DTSTART:${icsTimestamp(start)}`,
    `DTEND:${icsTimestamp(end)}`,
    `SUMMARY:${escapeText(event.summary)}`,
    `DESCRIPTION:${escapeText(event.description)}`,
    `LOCATION:${escapeText(event.location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}
