import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  bookingRules,
  buildings,
  getBuilding,
  getPackage,
  isPackageAllowedInBuilding,
  packages,
  site,
  type PackageId,
} from '../../config/site';
import type { BookingCreatedResponse, SlotsResponse } from '../../shared/api-types';
import type { BookableDay } from '../../shared/availability';
import { formatDateLong, formatDateShort, formatWindow } from '../../shared/dates';
import { buildIcsEvent } from '../../shared/ics';
import { formatUsd } from '../../shared/money';
import { bookingRequestSchema } from '../../shared/schemas';
import { ApiClientError, getJson, sendJson } from './lib/api';
import {
  Checkbox,
  FieldError,
  FormStatusMessage,
  Honeypot,
  SelectField,
  SubmitButton,
  TextArea,
  TextField,
} from './lib/fields';
import { useForm } from './lib/form';
import { Turnstile } from './lib/turnstile';

type SlotsState =
  { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; days: BookableDay[] };

const SLOT_DAYS = bookingRules.horizonDays + 1;
const SLOT_CONFLICT_CODES = new Set(['slot_full', 'slot_unavailable', 'already_booked']);

function initialPackage(): PackageId {
  const requested = new URLSearchParams(window.location.search).get('package');
  return packages.some((p) => p.id === requested) ? (requested as PackageId) : 'room';
}

export default function BookingWidget() {
  const form = useForm({
    package: initialPackage(),
    date: '',
    startTime: '',
    name: '',
    email: '',
    phone: '',
    building: '',
    room: '',
    paymentPreference: '',
    notes: '',
    agreePayment: false,
    agreePolicies: false,
    company: '',
  });
  const { values, set, errors, status } = form;
  const [slots, setSlots] = useState<SlotsState>({ kind: 'loading' });
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [booked, setBooked] = useState<BookingCreatedResponse | null>(null);
  const confirmationHeading = useRef<HTMLHeadingElement>(null);

  async function loadSlots(signal?: AbortSignal): Promise<BookableDay[] | null> {
    try {
      const data = await getJson<SlotsResponse>(`/api/slots?days=${SLOT_DAYS}`, signal);
      setSlots({ kind: 'ready', days: data.days });
      return data.days;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return null;
      setSlots({
        kind: 'error',
        message: error instanceof ApiClientError ? error.message : 'We couldn’t load open times.',
      });
      return null;
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadSlots(controller.signal);
    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (booked) confirmationHeading.current?.focus();
  }, [booked]);

  const selectedDay =
    slots.kind === 'ready' ? slots.days.find((d) => d.date === values.date) : undefined;
  const selectedWindow = selectedDay?.windows.find((w) => w.startTime === values.startTime);
  const pkg = getPackage(values.package);
  const building = values.building ? getBuilding(values.building) : undefined;
  const communal = building?.bathroomType === 'communal';
  const hasOpenings =
    slots.kind === 'ready' && slots.days.some((d) => d.windows.some((w) => w.remaining > 0));

  const buildingOptions = useMemo(() => buildings.map((b) => ({ value: b.id, label: b.name })), []);

  function chooseDate(date: string) {
    set('date', date);
    set('startTime', '');
  }

  async function onSubmit(event: Event) {
    event.preventDefault();
    if (status.kind === 'submitting') return;
    const payload = { ...values, turnstileToken: token ?? '' };
    if (!form.check(bookingRequestSchema, payload)) return;

    form.setStatus({ kind: 'submitting' });
    try {
      const result = await sendJson<BookingCreatedResponse>('/api/bookings', payload);
      form.setStatus({ kind: 'idle' });
      setBooked(result);
      void loadSlots();
    } catch (error) {
      form.failFromError(error);
      if (error instanceof ApiClientError && SLOT_CONFLICT_CODES.has(error.code)) {
        const days = await loadSlots();
        const stillOpen = days
          ?.find((d) => d.date === values.date)
          ?.windows.some((w) => w.startTime === values.startTime && w.remaining > 0);
        if (!stillOpen) set('startTime', '');
      }
    } finally {
      setResetKey((k) => k + 1);
    }
  }

  if (booked) {
    return (
      <Confirmation
        booking={booked}
        building={building?.name ?? ''}
        room={values.room}
        headingRef={confirmationHeading}
        onBookAnother={() => {
          setBooked(null);
          form.setValues((v) => ({
            ...v,
            date: '',
            startTime: '',
            notes: '',
            agreePayment: false,
            agreePolicies: false,
          }));
        }}
      />
    );
  }

  return (
    <form
      class="booking form"
      ref={form.formRef}
      onSubmit={onSubmit}
      noValidate
      aria-describedby="booking-intro"
    >
      <p id="booking-intro" class="visually-hidden">
        Four steps: choose a package, pick a day and time, enter your details, then confirm.
      </p>

      <section class="booking__step card" aria-labelledby="step-package">
        <h2 id="step-package" class="booking__title">
          <span class="booking__num" aria-hidden="true">
            1
          </span>{' '}
          Choose a package
        </h2>
        <fieldset
          role="radiogroup"
          aria-invalid={errors.package ? 'true' : undefined}
          aria-describedby={errors.package ? 'package-error' : undefined}
        >
          <legend class="visually-hidden">Package</legend>
          <div class="option-grid option-grid--3">
            {packages.map((p) => {
              const blocked = communal && !isPackageAllowedInBuilding(p.id, values.building);
              return (
                <label
                  key={p.id}
                  class={`option ${values.package === p.id ? 'is-selected' : ''} ${blocked ? 'is-disabled' : ''}`}
                >
                  <input
                    type="radio"
                    name="package"
                    value={p.id}
                    checked={values.package === p.id}
                    disabled={blocked}
                    onChange={() => {
                      set('package', p.id);
                    }}
                    data-invalid={errors.package ? 'true' : undefined}
                  />
                  <span class="option__title">{p.name}</span>
                  <span class="option__price">{formatUsd(p.priceCents)}</span>
                  <span class="option__meta">{p.summary}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        {communal && (
          <p class="field__hint">
            {building.name} has shared floor bathrooms that the college maintains, so only the Room
            Clean is available there.
          </p>
        )}
        <FieldError id="package" error={errors.package} />
      </section>

      <section class="booking__step card" aria-labelledby="step-time">
        <h2 id="step-time" class="booking__title">
          <span class="booking__num" aria-hidden="true">
            2
          </span>{' '}
          Pick a day and time
        </h2>
        {slots.kind === 'loading' && (
          <p class="muted" role="status">
            <span class="spinner" aria-hidden="true" /> Loading open times…
          </p>
        )}
        {slots.kind === 'error' && (
          <div class="callout callout--danger" role="alert">
            <p>
              {slots.message}{' '}
              <button
                type="button"
                class="btn btn--small btn--secondary"
                onClick={() => void loadSlots()}
              >
                Try again
              </button>
            </p>
          </div>
        )}
        {slots.kind === 'ready' && !hasOpenings && (
          <div class="callout callout--info">
            <p>
              Every window in the next {bookingRules.horizonDays} days is booked.{' '}
              <a href="/contact">Contact us</a> and we’ll try to fit you in.
            </p>
          </div>
        )}
        {slots.kind === 'ready' && hasOpenings && (
          <>
            <fieldset
              role="radiogroup"
              aria-invalid={errors.date ? 'true' : undefined}
              aria-describedby={errors.date ? 'date-error' : undefined}
            >
              <legend>Day</legend>
              <div class="day-scroller">
                {slots.days.map((day) => {
                  const open = day.windows.filter((w) => w.remaining > 0).length;
                  return (
                    <label
                      key={day.date}
                      class={`day ${values.date === day.date ? 'is-selected' : ''} ${open === 0 ? 'is-disabled' : ''}`}
                    >
                      <input
                        type="radio"
                        name="date"
                        value={day.date}
                        checked={values.date === day.date}
                        disabled={open === 0}
                        onChange={() => {
                          chooseDate(day.date);
                        }}
                        data-invalid={errors.date ? 'true' : undefined}
                      />
                      <span class="day__weekday">{formatDateShort(day.date).split(',')[0]}</span>
                      <span class="day__date">{formatDateShort(day.date).split(', ')[1]}</span>
                      <span class="day__meta">
                        {day.windows.length === 0
                          ? 'No times'
                          : open === 0
                            ? 'Full'
                            : `${open} open`}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <FieldError id="date" error={errors.date} />

            {selectedDay && (
              <fieldset
                class="windows"
                role="radiogroup"
                aria-invalid={errors.startTime ? 'true' : undefined}
                aria-describedby={errors.startTime ? 'startTime-error' : undefined}
              >
                <legend>Time window on {formatDateLong(selectedDay.date)}</legend>
                <div class="option-grid">
                  {selectedDay.windows.map((w) => (
                    <label
                      key={w.startTime}
                      class={`option ${values.startTime === w.startTime ? 'is-selected' : ''} ${w.remaining === 0 ? 'is-disabled' : ''}`}
                    >
                      <input
                        type="radio"
                        name="startTime"
                        value={w.startTime}
                        checked={values.startTime === w.startTime}
                        disabled={w.remaining === 0}
                        onChange={() => {
                          set('startTime', w.startTime);
                        }}
                        data-invalid={errors.startTime ? 'true' : undefined}
                      />
                      <span class="option__title">{formatWindow(w.startTime, w.endTime)}</span>
                      <span class="option__meta">
                        {w.remaining === 0
                          ? 'Full'
                          : w.remaining === 1
                            ? '1 spot left'
                            : `${w.remaining} spots left`}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <FieldError id="startTime" error={errors.startTime} />
            <p class="field__hint">
              Times are Eastern Time. Your cleaner arrives during the window; most visits take under
              an hour per package.
            </p>
          </>
        )}
      </section>

      <section class="booking__step card" aria-labelledby="step-details">
        <h2 id="step-details" class="booking__title">
          <span class="booking__num" aria-hidden="true">
            3
          </span>{' '}
          Your details
        </h2>
        <div class="form">
          <TextField
            id="name"
            label="Full name"
            autoComplete="name"
            value={values.name}
            onValue={(v) => {
              set('name', v);
            }}
            error={errors.name}
            maxLength={80}
          />
          <div class="form-row form-row--2">
            <TextField
              id="email"
              label="Email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={values.email}
              onValue={(v) => {
                set('email', v);
              }}
              error={errors.email}
              maxLength={254}
            />
            <TextField
              id="phone"
              label="Mobile number"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              hint="For day-of updates by text."
              value={values.phone}
              onValue={(v) => {
                set('phone', v);
              }}
              error={errors.phone}
              maxLength={30}
            />
          </div>
          <div class="form-row form-row--2">
            <SelectField
              id="building"
              label="Residence hall"
              placeholder="Choose your hall"
              options={buildingOptions}
              value={values.building}
              onValue={(v) => {
                set('building', v);
              }}
              error={errors.building}
            />
            <TextField
              id="room"
              label="Room or apartment number"
              autoComplete="off"
              value={values.room}
              onValue={(v) => {
                set('room', v);
              }}
              error={errors.room}
              maxLength={20}
            />
          </div>
          <fieldset
            role="radiogroup"
            aria-invalid={errors.paymentPreference ? 'true' : undefined}
            aria-describedby={errors.paymentPreference ? 'paymentPreference-error' : undefined}
          >
            <legend>How will you pay?</legend>
            <div class="option-grid option-grid--2">
              {(['cash', 'venmo'] as const).map((method) => (
                <label
                  key={method}
                  class={`option option--compact ${values.paymentPreference === method ? 'is-selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="paymentPreference"
                    value={method}
                    checked={values.paymentPreference === method}
                    onChange={() => {
                      set('paymentPreference', method);
                    }}
                    data-invalid={errors.paymentPreference ? 'true' : undefined}
                  />
                  <span class="option__title">{method === 'cash' ? 'Cash' : 'Venmo'}</span>
                  <span class="option__meta">
                    {method === 'cash' ? 'Exact change appreciated' : site.contact.venmoHandle}
                  </span>
                </label>
              ))}
            </div>
            <FieldError id="paymentPreference" error={errors.paymentPreference} />
          </fieldset>
          <TextArea
            id="notes"
            label="Anything we should know?"
            optional
            hint="Allergies, fragrance-free requests, problem areas…"
            rows={3}
            value={values.notes}
            onValue={(v) => {
              set('notes', v);
            }}
            error={errors.notes}
            maxLength={500}
          />
        </div>
      </section>

      <section class="booking__step card" aria-labelledby="step-confirm">
        <h2 id="step-confirm" class="booking__title">
          <span class="booking__num" aria-hidden="true">
            4
          </span>{' '}
          Confirm
        </h2>
        <dl class="summary">
          <div>
            <dt>Package</dt>
            <dd>{pkg.name}</dd>
          </div>
          <div>
            <dt>When</dt>
            <dd>
              {selectedDay && selectedWindow
                ? `${formatDateLong(selectedDay.date)}, ${formatWindow(selectedWindow.startTime, selectedWindow.endTime)}`
                : 'Choose a day and time'}
            </dd>
          </div>
          <div>
            <dt>Price</dt>
            <dd class="summary__price">{formatUsd(pkg.priceCents)}</dd>
          </div>
        </dl>
        <div class="callout callout--accent">
          <p>
            <strong>Payment is due in person.</strong> Pay {formatUsd(pkg.priceCents)} with cash or
            Venmo ({site.contact.venmoHandle}) when your cleaning is done. Nothing is charged
            online.
          </p>
        </div>
        <div class="form">
          <Checkbox
            id="agreePayment"
            checked={values.agreePayment}
            onValue={(v) => {
              set('agreePayment', v);
            }}
            error={errors.agreePayment}
          >
            I’ll pay {formatUsd(pkg.priceCents)} in person with cash or Venmo when the cleaning is
            done.
          </Checkbox>
          <Checkbox
            id="agreePolicies"
            checked={values.agreePolicies}
            onValue={(v) => {
              set('agreePolicies', v);
            }}
            error={errors.agreePolicies}
          >
            Someone who lives in the room will be there to let the cleaner in, and I’ll give at
            least {bookingRules.cancellationNoticeHours} hours’ notice to cancel or reschedule (
            <a href="/terms" target="_blank" rel="noopener">
              terms<span class="visually-hidden"> (opens in a new tab)</span>
            </a>
            ).
          </Checkbox>
          <Honeypot
            value={values.company}
            onValue={(v) => {
              set('company', v);
            }}
          />
          <Turnstile
            action="booking"
            onToken={setToken}
            resetKey={resetKey}
            error={errors.turnstileToken}
          />
          <FormStatusMessage message={status.kind === 'error' ? status.message : null} />
          <SubmitButton busy={status.kind === 'submitting'}>
            Book for {formatUsd(pkg.priceCents)}
          </SubmitButton>
        </div>
      </section>
    </form>
  );
}

function Confirmation({
  booking,
  building,
  room,
  headingRef,
  onBookAnother,
}: {
  booking: BookingCreatedResponse;
  building: string;
  room: string;
  headingRef: { current: HTMLHeadingElement | null };
  onBookAnother: () => void;
}) {
  const pkg = getPackage(booking.package);
  const icsHref = useMemo(() => {
    const ics = buildIcsEvent({
      uid: `${booking.reference}@scot-free-cleaning`,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      timeZone: site.timeZone,
      summary: `${site.name}: ${pkg.name}`,
      description: `Booking ${booking.reference}. Pay ${formatUsd(booking.priceCents)} in person (cash or Venmo ${site.contact.venmoHandle}).`,
      location: `${building}, room ${room}`,
      now: new Date(),
    });
    return URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  }, [booking, building, room, pkg.name]);
  useEffect(
    () => () => {
      URL.revokeObjectURL(icsHref);
    },
    [icsHref],
  );

  return (
    <div class="card confirmation" role="region" aria-labelledby="booked-heading">
      <p class="eyebrow">Booking received</p>
      <h2 id="booked-heading" tabIndex={-1} ref={headingRef}>
        You’re booked!
      </h2>
      <p class="confirmation__ref">
        Reference <strong data-testid="booking-reference">{booking.reference}</strong>
      </p>
      <dl class="summary">
        <div>
          <dt>Package</dt>
          <dd>{pkg.name}</dd>
        </div>
        <div>
          <dt>When</dt>
          <dd>
            {formatDateLong(booking.date)}, {formatWindow(booking.startTime, booking.endTime)}
          </dd>
        </div>
        <div>
          <dt>Where</dt>
          <dd>
            {building}, room {room}
          </dd>
        </div>
        <div>
          <dt>Pay in person</dt>
          <dd class="summary__price">{formatUsd(booking.priceCents)}</dd>
        </div>
      </dl>
      <h3>What happens next</h3>
      <ul class="check-list">
        <li>Save your reference. You’ll need it to cancel or reschedule.</li>
        <li>We’ll text or email you if anything changes before your visit.</li>
        <li>Be there to let your cleaner in at the start of your window.</li>
        <li>
          Pay {formatUsd(booking.priceCents)} with cash or Venmo ({site.contact.venmoHandle}) when
          we’re done.
        </li>
      </ul>
      <p class="small muted">
        Need to change something? <a href="/contact">Contact us</a> at least{' '}
        {bookingRules.cancellationNoticeHours} hours before your window.
      </p>
      <div class="confirmation__actions">
        <a class="btn" href={icsHref} download={`scot-free-${booking.reference}.ics`}>
          Add to calendar
        </a>
        <button type="button" class="btn btn--secondary" onClick={onBookAnother}>
          Book another cleaning
        </button>
      </div>
    </div>
  );
}
