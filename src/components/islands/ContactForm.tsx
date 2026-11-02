import { useEffect, useRef, useState } from 'preact/hooks';
import { contactTopicLabels, contactTopics, site, type ContactTopic } from '../../config/site';
import type { OkResponse } from '../../shared/api-types';
import { contactRequestSchema } from '../../shared/schemas';
import { sendJson } from './lib/api';
import {
  FormStatusMessage,
  Honeypot,
  SelectField,
  SubmitButton,
  TextArea,
  TextField,
} from './lib/fields';
import { useForm } from './lib/form';
import { Turnstile } from './lib/turnstile';

function initialTopic(): ContactTopic | '' {
  const requested = new URLSearchParams(window.location.search).get('topic');
  return contactTopics.includes(requested as ContactTopic) ? (requested as ContactTopic) : '';
}

export default function ContactForm() {
  const form = useForm({
    name: '',
    email: '',
    phone: '',
    topic: initialTopic(),
    bookingReference: '',
    message: '',
    company: '',
  });
  const { values, set, errors, status } = form;
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [done, setDone] = useState(false);
  const doneHeading = useRef<HTMLHeadingElement>(null);
  const aboutBooking = values.topic === 'reschedule' || values.topic === 'cancel';

  useEffect(() => {
    if (done) doneHeading.current?.focus();
  }, [done]);

  async function onSubmit(event: Event) {
    event.preventDefault();
    if (status.kind === 'submitting') return;
    const payload = { ...values, turnstileToken: token ?? '' };
    if (!form.check(contactRequestSchema, payload)) return;
    form.setStatus({ kind: 'submitting' });
    try {
      await sendJson<OkResponse>('/api/contact', payload);
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
      <div class="card success-panel" role="region" aria-labelledby="contact-done">
        <h2 id="contact-done" tabIndex={-1} ref={doneHeading}>
          Message sent
        </h2>
        <p>
          Thanks, {values.name.split(' ')[0]}. {site.contact.responseTime} We’ll reply to{' '}
          {values.email}.
        </p>
      </div>
    );
  }

  return (
    <form class="form card" ref={form.formRef} onSubmit={onSubmit} noValidate>
      <div class="form-row form-row--2">
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
      </div>
      <div class="form-row form-row--2">
        <TextField
          id="phone"
          label="Mobile number"
          optional
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
        <SelectField
          id="topic"
          label="Topic"
          placeholder="Choose a topic"
          options={contactTopics.map((t) => ({ value: t, label: contactTopicLabels[t] }))}
          value={values.topic}
          onValue={(v) => {
            set('topic', v as ContactTopic);
          }}
          error={errors.topic}
        />
      </div>
      {aboutBooking && (
        <TextField
          id="bookingReference"
          label="Booking reference"
          optional
          hint="It looks like SF-7K2Q9M and was shown when you booked."
          autoComplete="off"
          value={values.bookingReference}
          onValue={(v) => {
            set('bookingReference', v);
          }}
          error={errors.bookingReference}
          maxLength={9}
        />
      )}
      <TextArea
        id="message"
        label="Message"
        rows={5}
        value={values.message}
        onValue={(v) => {
          set('message', v);
        }}
        error={errors.message}
        maxLength={3000}
      />
      <Honeypot
        value={values.company}
        onValue={(v) => {
          set('company', v);
        }}
      />
      <Turnstile
        action="contact"
        onToken={setToken}
        resetKey={resetKey}
        error={errors.turnstileToken}
      />
      <FormStatusMessage message={status.kind === 'error' ? status.message : null} />
      <SubmitButton busy={status.kind === 'submitting'}>Send message</SubmitButton>
    </form>
  );
}
