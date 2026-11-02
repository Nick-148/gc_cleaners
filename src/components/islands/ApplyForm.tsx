import { useEffect, useRef, useState } from 'preact/hooks';
import { classYears, weekdays, type WeekdayKey } from '../../config/site';
import type { OkResponse } from '../../shared/api-types';
import { applicationRequestSchema } from '../../shared/schemas';
import { sendJson } from './lib/api';
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

const yearLabels: Record<(typeof classYears)[number], string> = {
  'first-year': 'First-year',
  sophomore: 'Sophomore',
  junior: 'Junior',
  senior: 'Senior',
  other: 'Other',
};

const dayLabels: Record<WeekdayKey, string> = {
  sun: 'Sunday',
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
};

export default function ApplyForm() {
  const form = useForm({
    name: '',
    email: '',
    phone: '',
    classYear: '',
    availability: [] as WeekdayKey[],
    hoursPerWeek: '',
    experience: '',
    motivation: '',
    agreeTerms: false,
    company: '',
  });
  const { values, set, errors, status } = form;
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [done, setDone] = useState(false);
  const doneHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (done) doneHeading.current?.focus();
  }, [done]);

  function toggleDay(day: WeekdayKey, on: boolean) {
    set(
      'availability',
      on ? [...values.availability, day] : values.availability.filter((d) => d !== day),
    );
  }

  async function onSubmit(event: Event) {
    event.preventDefault();
    if (status.kind === 'submitting') return;
    const payload = { ...values, turnstileToken: token ?? '' };
    if (!form.check(applicationRequestSchema, payload)) return;
    form.setStatus({ kind: 'submitting' });
    try {
      await sendJson<OkResponse>('/api/applications', payload);
      form.setStatus({ kind: 'idle' });
      setDone(true);
    } catch (error) {
      form.failFromError(error);
    } finally {
      setResetKey((k) => k + 1);
    }
  }

  if (done) {
    return (
      <div class="card success-panel" role="region" aria-labelledby="apply-done">
        <h2 id="apply-done" tabIndex={-1} ref={doneHeading}>
          Application received. Thank you!
        </h2>
        <p>We’ll review it and email {values.email} about next steps, usually within a few days.</p>
      </div>
    );
  }

  return (
    <form class="form card" ref={form.formRef} onSubmit={onSubmit} noValidate>
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
          id="classYear"
          label="Class year"
          placeholder="Choose one"
          options={classYears.map((y) => ({ value: y, label: yearLabels[y] }))}
          value={values.classYear}
          onValue={(v) => {
            set('classYear', v);
          }}
          error={errors.classYear}
        />
        <TextField
          id="hoursPerWeek"
          label="Hours per week you could work"
          type="number"
          inputMode="numeric"
          min={1}
          max={40}
          value={values.hoursPerWeek}
          onValue={(v) => {
            set('hoursPerWeek', v);
          }}
          error={errors.hoursPerWeek}
        />
      </div>
      <fieldset
        class="field"
        aria-describedby={errors.availability ? 'availability-error' : undefined}
      >
        <legend>Which days are you usually free?</legend>
        <div class="check-grid">
          {weekdays.map((day) => (
            <label key={day} class="checkbox" htmlFor={`day-${day}`}>
              <input
                type="checkbox"
                id={`day-${day}`}
                name="availability"
                value={day}
                checked={values.availability.includes(day)}
                onChange={(e) => {
                  toggleDay(day, e.currentTarget.checked);
                }}
                aria-invalid={errors.availability ? 'true' : undefined}
              />
              <span>{dayLabels[day]}</span>
            </label>
          ))}
        </div>
        <FieldError id="availability" error={errors.availability} />
      </fieldset>
      <TextArea
        id="experience"
        label="Any cleaning or work experience?"
        optional
        rows={3}
        value={values.experience}
        onValue={(v) => {
          set('experience', v);
        }}
        error={errors.experience}
        maxLength={1500}
      />
      <TextArea
        id="motivation"
        label="Why do you want to join the team?"
        rows={4}
        value={values.motivation}
        onValue={(v) => {
          set('motivation', v);
        }}
        error={errors.motivation}
        maxLength={1500}
      />
      <Checkbox
        id="agreeTerms"
        checked={values.agreeTerms}
        onValue={(v) => {
          set('agreeTerms', v);
        }}
        error={errors.agreeTerms}
      >
        I understand cleaners keep 75% of each job’s price, are paid per completed job, and choose
        which jobs to take.
      </Checkbox>
      <Honeypot
        value={values.company}
        onValue={(v) => {
          set('company', v);
        }}
      />
      <Turnstile
        action="apply"
        onToken={setToken}
        resetKey={resetKey}
        error={errors.turnstileToken}
      />
      <FormStatusMessage message={status.kind === 'error' ? status.message : null} />
      <SubmitButton busy={status.kind === 'submitting'}>Send application</SubmitButton>
    </form>
  );
}
