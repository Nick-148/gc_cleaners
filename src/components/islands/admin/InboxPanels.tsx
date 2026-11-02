/** Quote requests, job applications and contact messages. */
import { useState } from 'preact/hooks';
import { buildingName, applicationStatuses, quoteStatuses } from '../../../config/site';
import type {
  AdminApplication,
  AdminMessage,
  AdminQuote,
  ListResponse,
} from '../../../shared/api-types';
import { formatUsd } from '../../../shared/money';
import { sendJson } from '../lib/api';
import {
  formatTimestamp,
  LoadState,
  NotesEditor,
  StatusBadge,
  useAction,
  useNotify,
  useResource,
} from './shared';

const PREVIEWABLE = new Set(['image/jpeg', 'image/png', 'image/webp']);

function StatusFilter({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <div class="admin-filters">
      <label class="admin-filter-label" htmlFor={id}>
        Status
      </label>
      <select
        id={id}
        class="select"
        value={value}
        onChange={(e) => {
          onChange(e.currentTarget.value);
        }}
      >
        <option value="">Any status</option>
        {options.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );
}

export function QuotesPanel({ onChanged }: { onChanged: () => void }) {
  const [status, setStatus] = useState('new');
  const quotes = useResource<ListResponse<AdminQuote>>(
    `/api/admin/quotes${status ? `?status=${status}` : ''}`,
  );
  const items = quotes.data?.items ?? [];
  return (
    <section aria-labelledby="quotes-heading">
      <div class="admin-panel-head">
        <h2 id="quotes-heading">Quote requests</h2>
        <StatusFilter
          id="quote-status"
          value={status}
          options={quoteStatuses}
          onChange={setStatus}
        />
      </div>
      <LoadState resource={quotes} empty={items.length === 0}>
        <ul class="admin-list" role="list">
          {items.map((q) => (
            <QuoteCard
              key={`${q.id}-${q.updatedAt}`}
              quote={q}
              onChanged={() => {
                quotes.reload();
                onChanged();
              }}
            />
          ))}
        </ul>
      </LoadState>
    </section>
  );
}

function QuoteCard({ quote: q, onChanged }: { quote: AdminQuote; onChanged: () => void }) {
  const { busy, run } = useAction();
  const notify = useNotify();
  const [price, setPrice] = useState(q.quotedCents === null ? '' : String(q.quotedCents / 100));
  const update = (body: Record<string, unknown>, message: string) =>
    run(() => sendJson(`/api/admin/quotes/${q.id}`, body, 'PATCH'), message, onChanged);
  return (
    <li class="card admin-card">
      <div class="admin-card__head">
        <p class="admin-card__title">
          {q.reference} · {q.space}
        </p>
        <StatusBadge status={q.status} />
      </div>
      <dl class="admin-meta">
        <dt>From</dt>
        <dd>
          {q.name} ·{' '}
          <a
            href={`mailto:${q.email}?subject=${encodeURIComponent(`Your Scot-Free quote ${q.reference}`)}`}
          >
            {q.email}
          </a>
          {q.phone && (
            <>
              {' '}
              · <a href={`tel:${q.phone.replace(/[^\d+]/g, '')}`}>{q.phone}</a>
            </>
          )}
        </dd>
        <dt>Where</dt>
        <dd>
          {buildingName(q.building)}
          {q.room ? `, room ${q.room}` : ''}
        </dd>
        {q.preferredTiming && (
          <>
            <dt>Timing</dt>
            <dd>{q.preferredTiming}</dd>
          </>
        )}
        <dt>Received</dt>
        <dd>{formatTimestamp(q.createdAt)}</dd>
      </dl>
      <p class="prewrap">{q.description}</p>
      {q.photos.length > 0 && (
        <ul class="admin-photos" role="list" aria-label={`Photos for ${q.reference}`}>
          {q.photos.map((p, i) => {
            const url = `/api/admin/quotes/${q.id}/photos/${p.id}`;
            return (
              <li key={p.id}>
                <a href={url} target="_blank" rel="noopener">
                  {PREVIEWABLE.has(p.contentType) ? (
                    <img
                      src={url}
                      alt={`Quote ${q.reference}, attachment ${i + 1}`}
                      loading="lazy"
                    />
                  ) : (
                    <span class="photo-placeholder">Open HEIC photo {i + 1}</span>
                  )}
                </a>
              </li>
            );
          })}
        </ul>
      )}
      <div class="admin-add__fields">
        <label class="field">
          <span class="field__label">Quoted price ($)</span>
          <input
            class="input"
            type="number"
            min={0}
            step={5}
            value={price}
            onInput={(e) => {
              setPrice(e.currentTarget.value);
            }}
          />
        </label>
        <label class="field">
          <span class="field__label">Status</span>
          <select
            class="select"
            value={q.status}
            disabled={busy}
            onChange={(e) =>
              void update(
                { status: e.currentTarget.value },
                `${q.reference} marked ${e.currentTarget.value}`,
              )
            }
          >
            {quoteStatuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div class="admin-actions">
        <button
          type="button"
          class="btn btn--small"
          disabled={busy}
          onClick={() => {
            const cents = price.trim() === '' ? null : Math.round(Number(price) * 100);
            if (cents !== null && (!Number.isFinite(cents) || cents < 0)) {
              notify('Enter the price in dollars, like 75 or 82.50.', 'error');
              return;
            }
            void update(
              {
                quotedCents: cents,
                ...(cents !== null && q.status === 'new' ? { status: 'quoted' } : {}),
              },
              `Price saved${cents !== null ? `: ${formatUsd(cents)}` : ''}`,
            );
          }}
        >
          Save price
        </button>
      </div>
      <NotesEditor
        id={q.id}
        initial={q.adminNotes}
        busy={busy}
        onSave={(adminNotes) => void update({ adminNotes }, 'Notes saved')}
      />
    </li>
  );
}

export function ApplicationsPanel({ onChanged }: { onChanged: () => void }) {
  const [status, setStatus] = useState('new');
  const apps = useResource<ListResponse<AdminApplication>>(
    `/api/admin/applications${status ? `?status=${status}` : ''}`,
  );
  const items = apps.data?.items ?? [];
  return (
    <section aria-labelledby="apps-heading">
      <div class="admin-panel-head">
        <h2 id="apps-heading">Cleaner applications</h2>
        <StatusFilter
          id="app-status"
          value={status}
          options={applicationStatuses}
          onChange={setStatus}
        />
      </div>
      <LoadState resource={apps} empty={items.length === 0}>
        <ul class="admin-list" role="list">
          {items.map((a) => (
            <ApplicationCard
              key={`${a.id}-${a.updatedAt}`}
              app={a}
              onChanged={() => {
                apps.reload();
                onChanged();
              }}
            />
          ))}
        </ul>
      </LoadState>
    </section>
  );
}

function ApplicationCard({ app: a, onChanged }: { app: AdminApplication; onChanged: () => void }) {
  const { busy, run } = useAction();
  const update = (body: Record<string, unknown>, message: string) =>
    run(() => sendJson(`/api/admin/applications/${a.id}`, body, 'PATCH'), message, onChanged);
  return (
    <li class="card admin-card">
      <div class="admin-card__head">
        <p class="admin-card__title">
          {a.name} · {a.classYear}
        </p>
        <StatusBadge status={a.status} />
      </div>
      <dl class="admin-meta">
        <dt>Contact</dt>
        <dd>
          <a href={`mailto:${a.email}`}>{a.email}</a> ·{' '}
          <a href={`tel:${a.phone.replace(/[^\d+]/g, '')}`}>{a.phone}</a>
        </dd>
        <dt>Available</dt>
        <dd>
          {a.availability.join(', ')} · {a.hoursPerWeek} h/week
        </dd>
        <dt>Applied</dt>
        <dd>{formatTimestamp(a.createdAt)}</dd>
      </dl>
      {a.experience && (
        <>
          <h4>Experience</h4>
          <p class="prewrap">{a.experience}</p>
        </>
      )}
      <h4>Why they want to join</h4>
      <p class="prewrap">{a.motivation}</p>
      <label class="field">
        <span class="field__label">Status</span>
        <select
          class="select"
          value={a.status}
          disabled={busy}
          onChange={(e) =>
            void update(
              { status: e.currentTarget.value },
              `${a.name} marked ${e.currentTarget.value}`,
            )
          }
        >
          {applicationStatuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <NotesEditor
        id={a.id}
        initial={a.adminNotes}
        busy={busy}
        onSave={(adminNotes) => void update({ adminNotes }, 'Notes saved')}
      />
    </li>
  );
}

export function MessagesPanel({ onChanged }: { onChanged: () => void }) {
  const [status, setStatus] = useState('new');
  const messages = useResource<ListResponse<AdminMessage>>(
    `/api/admin/messages${status ? `?status=${status}` : ''}`,
  );
  const items = messages.data?.items ?? [];
  return (
    <section aria-labelledby="messages-heading">
      <div class="admin-panel-head">
        <h2 id="messages-heading">Messages</h2>
        <StatusFilter
          id="message-status"
          value={status}
          options={['new', 'handled']}
          onChange={setStatus}
        />
      </div>
      <LoadState resource={messages} empty={items.length === 0}>
        <ul class="admin-list" role="list">
          {items.map((m) => (
            <MessageCard
              key={`${m.id}-${m.updatedAt}`}
              message={m}
              onChanged={() => {
                messages.reload();
                onChanged();
              }}
            />
          ))}
        </ul>
      </LoadState>
    </section>
  );
}

function MessageCard({ message: m, onChanged }: { message: AdminMessage; onChanged: () => void }) {
  const { busy, run } = useAction();
  const next = m.status === 'new' ? 'handled' : 'new';
  return (
    <li class="card admin-card">
      <div class="admin-card__head">
        <p class="admin-card__title">
          {m.topic}
          {m.bookingReference ? ` · ${m.bookingReference}` : ''}
        </p>
        <StatusBadge status={m.status} />
      </div>
      <dl class="admin-meta">
        <dt>From</dt>
        <dd>
          {m.name} · <a href={`mailto:${m.email}`}>{m.email}</a>
          {m.phone && (
            <>
              {' '}
              · <a href={`tel:${m.phone.replace(/[^\d+]/g, '')}`}>{m.phone}</a>
            </>
          )}
        </dd>
        <dt>Received</dt>
        <dd>{formatTimestamp(m.createdAt)}</dd>
      </dl>
      <p class="prewrap">{m.body}</p>
      <div class="admin-actions">
        <button
          type="button"
          class={`btn btn--small ${next === 'handled' ? '' : 'btn--secondary'}`}
          disabled={busy}
          onClick={() =>
            void run(
              () => sendJson(`/api/admin/messages/${m.id}`, { status: next }, 'PATCH'),
              next === 'handled' ? 'Marked handled' : 'Reopened',
              onChanged,
            )
          }
        >
          {next === 'handled' ? 'Mark handled' : 'Reopen'}
        </button>
      </div>
    </li>
  );
}
