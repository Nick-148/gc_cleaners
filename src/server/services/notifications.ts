/** Email content for owner alerts and customer confirmations (ADR 0007). */
import {
  bookingRules,
  buildingName,
  contactTopicLabels,
  contactTopics,
  getPackage,
  site,
  type ContactTopic,
  type PackageId,
  type PaymentMethod,
} from '../../config/site';
import { formatDateLong, formatWindow } from '../../shared/dates';
import { formatUsd } from '../../shared/money';
import { escapeHtml } from '../lib/html';
import { log } from '../lib/log';
import type { MailMessage, Mailer } from './mailer';

type Row = readonly [label: string, value: string | number | null | undefined];
type Draft = Omit<MailMessage, 'to'>;

function render(
  title: string,
  intro: string,
  rows: readonly Row[],
  outro?: string,
): {
  text: string;
  html: string;
} {
  const value = (v: Row[1]): string =>
    v === null || v === undefined || v === '' ? '—' : String(v);
  const text = [
    title,
    '',
    intro,
    '',
    ...rows.map(([k, v]) => `${k}: ${value(v)}`),
    ...(outro ? ['', outro] : []),
    '',
    `— ${site.name}`,
  ].join('\n');
  const htmlRows = rows
    .map(
      ([k, v]) =>
        `<tr><th align="left" valign="top" style="padding:4px 12px 4px 0;color:#475569">${escapeHtml(k)}</th>` +
        `<td style="padding:4px 0;white-space:pre-wrap">${escapeHtml(value(v))}</td></tr>`,
    )
    .join('');
  const html =
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;line-height:1.5">` +
    `<h2 style="margin:0 0 8px">${escapeHtml(title)}</h2>` +
    `<p>${escapeHtml(intro)}</p>` +
    `<table cellpadding="0" cellspacing="0">${htmlRows}</table>` +
    (outro ? `<p>${escapeHtml(outro)}</p>` : '') +
    `<p style="color:#64748b;font-size:13px">${escapeHtml(site.name)} · ${escapeHtml(site.disclaimer)}</p>` +
    `</div>`;
  return { text, html };
}

export interface BookingEmailData {
  reference: string;
  package: PackageId;
  priceCents: number;
  date: string;
  startTime: string;
  endTime: string;
  name: string;
  email: string;
  phone: string;
  building: string;
  room: string;
  paymentPreference: PaymentMethod;
  notes: string | undefined;
}

const whenText = (b: { date: string; startTime: string; endTime: string }): string =>
  `${formatDateLong(b.date)}, ${formatWindow(b.startTime, b.endTime)}`;

export function bookingOwnerAlert(b: BookingEmailData): Draft {
  const pkg = getPackage(b.package);
  return {
    subject: `New booking ${b.reference}: ${pkg.name}, ${whenText(b)}`,
    replyTo: b.email,
    ...render(
      'New booking',
      'A student just booked a cleaning. It is pending until you confirm it in the dashboard.',
      [
        ['Reference', b.reference],
        ['Package', `${pkg.name} (${formatUsd(b.priceCents)})`],
        ['When', whenText(b)],
        ['Where', `${buildingName(b.building)}, room ${b.room}`],
        ['Name', b.name],
        ['Email', b.email],
        ['Phone', b.phone],
        ['Pays with', b.paymentPreference === 'venmo' ? 'Venmo' : 'Cash'],
        ['Notes', b.notes],
      ],
    ),
  };
}

export function bookingCustomerConfirmation(b: BookingEmailData): Draft {
  const pkg = getPackage(b.package);
  return {
    subject: `Your ${site.name} booking ${b.reference}`,
    ...render(
      'You’re booked!',
      `Thanks, ${b.name}. Here are your booking details. Keep this reference handy in case you need to reschedule.`,
      [
        ['Reference', b.reference],
        ['Package', pkg.name],
        ['When', whenText(b)],
        ['Where', `${buildingName(b.building)}, room ${b.room}`],
        [
          'Price',
          `${formatUsd(b.priceCents)}, paid in person (cash or Venmo ${site.contact.venmoHandle})`,
        ],
      ],
      `Someone who lives in the room needs to be there to let us in. To cancel or reschedule for free, contact us at least ${bookingRules.cancellationNoticeHours} hours before your window: ${site.contact.email}.`,
    ),
  };
}

export function quoteOwnerAlert(q: {
  reference: string;
  name: string;
  email: string;
  phone: string | undefined;
  building: string;
  room: string | undefined;
  space: string;
  description: string;
  preferredTiming: string | undefined;
  photoCount: number;
}): Draft {
  return {
    subject: `New quote request ${q.reference} (${q.photoCount} photo${q.photoCount === 1 ? '' : 's'})`,
    replyTo: q.email,
    ...render(
      'New quote request',
      'Review the photos in the admin dashboard and reply with an estimate.',
      [
        ['Reference', q.reference],
        ['Space', q.space],
        ['Where', `${buildingName(q.building)}${q.room ? `, room ${q.room}` : ''}`],
        ['Name', q.name],
        ['Email', q.email],
        ['Phone', q.phone],
        ['Preferred timing', q.preferredTiming],
        ['Photos', q.photoCount],
        ['Description', q.description],
      ],
    ),
  };
}

export function applicationOwnerAlert(a: {
  name: string;
  email: string;
  phone: string;
  classYear: string;
  availability: readonly string[];
  hoursPerWeek: number;
  experience: string | undefined;
  motivation: string;
}): Draft {
  return {
    subject: 'New cleaner application',
    replyTo: a.email,
    ...render('New cleaner application', 'Someone applied to join the team.', [
      ['Name', a.name],
      ['Email', a.email],
      ['Phone', a.phone],
      ['Class year', a.classYear],
      ['Available', a.availability.join(', ')],
      ['Hours per week', a.hoursPerWeek],
      ['Experience', a.experience],
      ['Why they want to join', a.motivation],
    ]),
  };
}

export function messageOwnerAlert(m: {
  name: string;
  email: string;
  phone: string | undefined;
  topic: ContactTopic;
  bookingReference?: string | undefined;
  message: string;
}): Draft {
  const topic = contactTopics.includes(m.topic) ? contactTopicLabels[m.topic] : 'Message';
  return {
    subject: `New message: ${topic}${m.bookingReference ? ` (${m.bookingReference})` : ''}`,
    replyTo: m.email,
    ...render('New contact message', topic, [
      ['Name', m.name],
      ['Email', m.email],
      ['Phone', m.phone],
      ['Booking', m.bookingReference],
      ['Message', m.message],
    ]),
  };
}

/**
 * Sends each message, logging failures without PII. Never throws: email problems must
 * never fail or block a submission that was already saved (ADR 0007).
 */
export async function deliver(
  mailer: Mailer,
  messages: readonly MailMessage[],
  requestId: string,
): Promise<void> {
  for (const message of messages) {
    try {
      await mailer.send(message);
    } catch (error) {
      log('error', 'email.failed', {
        requestId,
        mailer: mailer.kind,
        error: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
      });
    }
  }
}
