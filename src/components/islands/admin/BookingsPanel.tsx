import { useMemo, useState } from 'preact/hooks';
import {
  buildingName,
  bookingStatuses,
  getPackage,
  type BookingStatus,
} from '../../../config/site';
import type { AdminBooking, ListResponse } from '../../../shared/api-types';
import { addDays, formatDateLong, formatWindow } from '../../../shared/dates';
import { formatUsd } from '../../../shared/money';
import { sendJson } from '../lib/api';
import {
  formatTimestamp,
  LoadState,
  NotesEditor,
  StatusBadge,
  useAction,
  useResource,
} from './shared';

type Range = 'upcoming' | 'past' | 'all';

const NEXT_ACTIONS: Record<
  BookingStatus,
  readonly { status: BookingStatus; label: string; primary?: boolean }[]
> = {
  pending: [
    { status: 'confirmed', label: 'Confirm', primary: true },
    { status: 'cancelled', label: 'Cancel' },
  ],
  confirmed: [
    { status: 'completed', label: 'Mark completed', primary: true },
    { status: 'no_show', label: 'No-show' },
    { status: 'cancelled', label: 'Cancel' },
  ],
  completed: [],
  cancelled: [{ status: 'pending', label: 'Restore' }],
  no_show: [{ status: 'confirmed', label: 'Undo no-show' }],
};

export function BookingsPanel({ today, onChanged }: { today: string; onChanged: () => void }) {
  const [range, setRange] = useState<Range>('upcoming');
  const [status, setStatus] = useState<BookingStatus | ''>('');

  const path = useMemo(() => {
    const params = new URLSearchParams({ limit: '200' });
    if (range === 'upcoming') params.set('from', today);
    if (range === 'past') {
      params.set('from', addDays(today, -30));
      params.set('to', addDays(today, -1));
    }
    if (status) params.set('status', status);
    return `/api/admin/bookings?${params.toString()}`;
  }, [range, status, today]);

  const bookings = useResource<ListResponse<AdminBooking>>(path);
  const items = bookings.data?.items ?? [];
  const byDate = useMemo(() => {
    const groups = new Map<string, AdminBooking[]>();
    for (const b of range === 'past' ? [...items].reverse() : items) {
      groups.set(b.date, [...(groups.get(b.date) ?? []), b]);
    }
    return [...groups.entries()];
  }, [items, range]);

  return (
    <section aria-labelledby="bookings-heading">
      <div class="admin-panel-head">
        <h2 id="bookings-heading">Bookings</h2>
        <div class="admin-filters">
          <label class="admin-filter-label" htmlFor="booking-range">
            Date range
          </label>
          <select
            id="booking-range"
            class="select"
            value={range}
            onChange={(e) => {
              setRange(e.currentTarget.value as Range);
            }}
          >
            <option value="upcoming">Upcoming</option>
            <option value="past">Past 30 days</option>
            <option value="all">All</option>
          </select>
          <label class="admin-filter-label" htmlFor="booking-status">
            Status
          </label>
          <select
            id="booking-status"
            class="select"
            value={status}
            onChange={(e) => {
              setStatus(e.currentTarget.value as BookingStatus | '');
            }}
          >
            <option value="">Any status</option>
            {bookingStatuses.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>
      <LoadState resource={bookings} empty={items.length === 0}>
        {byDate.map(([date, list]) => (
          <div key={date} class="admin-day">
            <h3>{formatDateLong(date)}</h3>
            <ul class="admin-list" role="list">
              {list.map((b) => (
                <BookingCard
                  key={`${b.id}-${b.updatedAt}`}
                  booking={b}
                  onChanged={() => {
                    bookings.reload();
                    onChanged();
                  }}
                />
              ))}
            </ul>
          </div>
        ))}
      </LoadState>
    </section>
  );
}

function BookingCard({ booking: b, onChanged }: { booking: AdminBooking; onChanged: () => void }) {
  const { busy, run } = useAction();
  const update = (body: Record<string, unknown>, message: string) =>
    run(() => sendJson(`/api/admin/bookings/${b.id}`, body, 'PATCH'), message, onChanged);

  return (
    <li class="card admin-card">
      <div class="admin-card__head">
        <p class="admin-card__title">
          {formatWindow(b.startTime, b.endTime)} · {getPackage(b.package).name}
        </p>
        <StatusBadge status={b.status} />
      </div>
      <dl class="admin-meta">
        <dt>Ref</dt>
        <dd class="mono">{b.reference}</dd>
        <dt>Student</dt>
        <dd>{b.name}</dd>
        <dt>Where</dt>
        <dd>
          {buildingName(b.building)}, room {b.room}
        </dd>
        <dt>Phone</dt>
        <dd>
          <a href={`tel:${b.phone.replace(/[^\d+]/g, '')}`}>{b.phone}</a>
        </dd>
        <dt>Email</dt>
        <dd>
          <a href={`mailto:${b.email}`}>{b.email}</a>
        </dd>
        <dt>Price</dt>
        <dd>
          {formatUsd(b.priceCents)} · pays with {b.paymentPreference === 'venmo' ? 'Venmo' : 'cash'}
        </dd>
        {b.notes && (
          <>
            <dt>Notes</dt>
            <dd class="prewrap">{b.notes}</dd>
          </>
        )}
        <dt>Booked</dt>
        <dd>{formatTimestamp(b.createdAt)}</dd>
      </dl>
      <NotesEditor
        id={b.id}
        initial={b.adminNotes}
        busy={busy}
        onSave={(adminNotes) => void update({ adminNotes }, 'Notes saved')}
      />
      {NEXT_ACTIONS[b.status].length > 0 && (
        <div class="admin-actions">
          {NEXT_ACTIONS[b.status].map((action) => (
            <button
              key={action.status}
              type="button"
              class={`btn btn--small ${action.primary ? '' : 'btn--secondary'}`}
              disabled={busy}
              onClick={() => {
                if (
                  action.status === 'cancelled' &&
                  !window.confirm(`Cancel booking ${b.reference}? This frees the spot for others.`)
                )
                  return;
                void update(
                  { status: action.status },
                  `${b.reference}: ${action.label.toLowerCase()} done`,
                );
              }}
            >
              {action.label}
              <span class="visually-hidden"> booking {b.reference}</span>
            </button>
          ))}
        </div>
      )}
    </li>
  );
}
