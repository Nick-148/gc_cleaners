import { useEffect, useRef, useState } from 'preact/hooks';
import { buildings, quoteSpaces, site, uploadRules } from '../../config/site';
import type { ReferenceResponse } from '../../shared/api-types';
import { quoteRequestSchema } from '../../shared/schemas';
import { sendForm } from './lib/api';
import {
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

interface Photo {
  id: string;
  file: File;
  previewUrl: string | null;
}

const spaceLabels: Record<(typeof quoteSpaces)[number], string> = {
  room: 'Bedroom',
  bathroom: 'Bathroom',
  both: 'Bedroom and bathroom',
  other: 'Something else',
};

const BROWSER_RESIZABLE = new Set(['image/jpeg', 'image/png', 'image/webp']);
const RESIZE_THRESHOLD_BYTES = 1_500_000;
const MAX_DIMENSION = 2048;
const MB = 1024 * 1024;

/** Shrinks large JPEG/PNG/WebP photos in the browser so uploads are fast on campus Wi-Fi. */
async function prepareImage(file: File): Promise<File> {
  if (!BROWSER_RESIZABLE.has(file.type) || file.size <= RESIZE_THRESHOLD_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.85);
    });
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

function formatBytes(bytes: number): string {
  return bytes >= MB
    ? `${(bytes / MB).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function QuoteForm() {
  const form = useForm({
    name: '',
    email: '',
    phone: '',
    building: '',
    room: '',
    space: '',
    description: '',
    preferredTiming: '',
    company: '',
  });
  const { values, set, errors, status } = form;
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [reference, setReference] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const successHeading = useRef<HTMLHeadingElement>(null);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  useEffect(
    () => () => {
      for (const p of photosRef.current) if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
    },
    [],
  );

  useEffect(() => {
    if (reference) successHeading.current?.focus();
  }, [reference]);

  async function addFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const incoming = [...fileList];
    // photosRef is current even if another batch finished while this one was preparing.
    const room = uploadRules.maxFiles - photosRef.current.length;
    const tooMany = `You can attach up to ${uploadRules.maxFiles} photos.`;
    if (incoming.length > room) form.setErrors((e) => ({ ...e, photos: tooMany }));
    setPreparing(true);
    const prepared: Photo[] = [];
    for (const file of incoming.slice(0, Math.max(0, room))) {
      const ready = await prepareImage(file);
      if (ready.size > uploadRules.maxFileBytes) {
        form.setErrors((e) => ({
          ...e,
          photos: `${file.name} is larger than ${uploadRules.maxFileBytes / MB} MB.`,
        }));
        continue;
      }
      const previewable = BROWSER_RESIZABLE.has(ready.type);
      prepared.push({
        id: crypto.randomUUID(),
        file: ready,
        previewUrl: previewable ? URL.createObjectURL(ready) : null,
      });
    }
    setPreparing(false);
    if (prepared.length > 0) {
      setPhotos((current) => {
        const accepted = prepared.slice(0, Math.max(0, uploadRules.maxFiles - current.length));
        for (const dropped of prepared.slice(accepted.length)) {
          if (dropped.previewUrl) URL.revokeObjectURL(dropped.previewUrl);
        }
        if (accepted.length < prepared.length) form.setErrors((e) => ({ ...e, photos: tooMany }));
        return [...current, ...accepted];
      });
      if (incoming.length <= room) {
        form.setErrors((e) => {
          const next = { ...e };
          delete next.photos;
          return next;
        });
      }
    }
    if (fileInput.current) fileInput.current.value = '';
  }

  function removePhoto(id: string) {
    setPhotos((current) => {
      const target = current.find((p) => p.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return current.filter((p) => p.id !== id);
    });
  }

  async function onSubmit(event: Event) {
    event.preventDefault();
    if (status.kind === 'submitting' || preparing) return;
    const payload = { ...values, turnstileToken: token ?? '' };
    if (!form.check(quoteRequestSchema, payload)) return;
    const total = photos.reduce((sum, p) => sum + p.file.size, 0);
    if (total > uploadRules.maxTotalBytes) {
      form.fail(
        { photos: `All photos together must be ${uploadRules.maxTotalBytes / MB} MB or smaller.` },
        'Please remove a photo or two and try again.',
      );
      return;
    }

    const body = new FormData();
    for (const [key, value] of Object.entries(payload)) body.set(key, value);
    for (const photo of photos) body.append('photos', photo.file, photo.file.name);

    form.setStatus({ kind: 'submitting' });
    try {
      const result = await sendForm<ReferenceResponse>('/api/quotes', body);
      form.setStatus({ kind: 'idle' });
      setReference(result.reference);
    } catch (error) {
      form.failFromError(error);
    } finally {
      setResetKey((k) => k + 1);
    }
  }

  if (reference) {
    return (
      <div class="card success-panel" role="region" aria-labelledby="quote-done">
        <h2 id="quote-done" tabIndex={-1} ref={successHeading}>
          Thanks! Your quote request is in.
        </h2>
        <p>
          Your reference is <strong data-testid="quote-reference">{reference}</strong>. We’ll look
          at your photos and reply to {values.email} with a price, usually within one business day.
        </p>
        <p class="small muted">
          Photos are deleted automatically after {uploadRules.retentionDays} days.
        </p>
        <p>
          <a class="btn btn--secondary" href="/book">
            See open booking times
          </a>
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
          id="space"
          label="What needs cleaning?"
          placeholder="Choose one"
          options={quoteSpaces.map((s) => ({ value: s, label: spaceLabels[s] }))}
          value={values.space}
          onValue={(v) => {
            set('space', v);
          }}
          error={errors.space}
        />
      </div>
      <div class="form-row form-row--2">
        <SelectField
          id="building"
          label="Residence hall"
          placeholder="Choose your hall"
          options={buildings.map((b) => ({ value: b.id, label: b.name }))}
          value={values.building}
          onValue={(v) => {
            set('building', v);
          }}
          error={errors.building}
        />
        <TextField
          id="room"
          label="Room or apartment number"
          optional
          autoComplete="off"
          value={values.room}
          onValue={(v) => {
            set('room', v);
          }}
          error={errors.room}
          maxLength={20}
        />
      </div>
      <TextArea
        id="description"
        label="Describe the space and the job"
        hint="Size of the space, what’s worst (mildew, carpet stains, move-out?), and anything we should know."
        rows={5}
        value={values.description}
        onValue={(v) => {
          set('description', v);
        }}
        error={errors.description}
        maxLength={2000}
      />
      <TextField
        id="preferredTiming"
        label="When would you like it done?"
        optional
        hint="For example “before checkout on May 9” or “any weekday evening”."
        value={values.preferredTiming}
        onValue={(v) => {
          set('preferredTiming', v);
        }}
        error={errors.preferredTiming}
        maxLength={200}
      />

      <div class="field">
        <span class="field__label" id="photos-label">
          Photos <span class="field__optional">(optional, up to {uploadRules.maxFiles})</span>
        </span>
        <div
          class={`photo-drop ${dragging ? 'is-dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => {
            setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void addFiles(e.dataTransfer?.files ?? null);
          }}
        >
          <p class="field__hint" id="photos-hint">
            JPEG, PNG, WebP or HEIC, up to {uploadRules.maxFileBytes / MB} MB each. Photos are only
            seen by our team and deleted after {uploadRules.retentionDays} days.
          </p>
          <label class="btn btn--secondary btn--small" htmlFor="photos">
            {photos.length > 0 ? 'Add more photos' : 'Choose photos'}
          </label>
          <input
            ref={fileInput}
            id="photos"
            name="photos"
            type="file"
            class="visually-hidden"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
            multiple
            disabled={photos.length >= uploadRules.maxFiles}
            onChange={(e) => void addFiles(e.currentTarget.files)}
            aria-labelledby="photos-label"
            aria-describedby={`photos-hint${errors.photos ? ' photos-error' : ''}`}
            aria-invalid={errors.photos ? 'true' : undefined}
          />
          {preparing && (
            <p class="small muted" role="status">
              <span class="spinner" aria-hidden="true" /> Preparing photos…
            </p>
          )}
        </div>
        <FieldError id="photos" error={errors.photos} />
        {photos.length > 0 && (
          <ul class="photo-list" aria-label="Attached photos">
            {photos.map((photo) => (
              <li key={photo.id}>
                {photo.previewUrl ? (
                  <img src={photo.previewUrl} alt="" />
                ) : (
                  <span class="photo-placeholder" aria-hidden="true">
                    HEIC
                  </span>
                )}
                <span class="photo-list__name">{photo.file.name}</span>
                <span class="muted">{formatBytes(photo.file.size)}</span>
                <button
                  type="button"
                  class="btn btn--small btn--secondary"
                  onClick={() => {
                    removePhoto(photo.id);
                  }}
                >
                  Remove<span class="visually-hidden"> {photo.file.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Honeypot
        value={values.company}
        onValue={(v) => {
          set('company', v);
        }}
      />
      <Turnstile
        action="quote"
        onToken={setToken}
        resetKey={resetKey}
        error={errors.turnstileToken}
      />
      <FormStatusMessage message={status.kind === 'error' ? status.message : null} />
      <SubmitButton busy={status.kind === 'submitting' || preparing}>Request my quote</SubmitButton>
      <p class="small muted">
        By submitting, you agree we can contact you about this request. See our{' '}
        <a href="/privacy">privacy policy</a>. {site.contact.responseTime}
      </p>
    </form>
  );
}
