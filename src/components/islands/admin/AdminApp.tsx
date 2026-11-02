import { useEffect, useState } from 'preact/hooks';
import { site } from '../../../config/site';
import type { AdminMe, AdminSummary } from '../../../shared/api-types';
import { zonedDateTime } from '../../../shared/dates';
import { ApiClientError, getJson } from '../lib/api';
import { BookingsPanel } from './BookingsPanel';
import { ApplicationsPanel, MessagesPanel, QuotesPanel } from './InboxPanels';
import { SchedulePanel } from './SchedulePanel';
import { NotifyProvider, useResource } from './shared';

const TABS = [
  { id: 'bookings', label: 'Bookings' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'quotes', label: 'Quotes' },
  { id: 'applications', label: 'Applications' },
  { id: 'messages', label: 'Messages' },
] as const;
type TabId = (typeof TABS)[number]['id'];

function tabFromHash(): TabId {
  const hash = window.location.hash.slice(1);
  return TABS.some((t) => t.id === hash) ? (hash as TabId) : 'bookings';
}

type Auth =
  | { kind: 'loading' }
  | { kind: 'ok'; email: string }
  | { kind: 'error'; status: number; message: string };

export default function AdminApp() {
  const [auth, setAuth] = useState<Auth>({ kind: 'loading' });
  const [tab, setTab] = useState<TabId>(tabFromHash);
  const summary = useResource<AdminSummary>('/api/admin/summary');
  const today = summary.data?.today ?? zonedDateTime(new Date(), site.timeZone).date;

  useEffect(() => {
    getJson<AdminMe>('/api/admin/me')
      .then((me) => {
        setAuth({ kind: 'ok', email: me.email });
      })
      .catch((error: unknown) => {
        const status = error instanceof ApiClientError ? error.status : 0;
        const message =
          error instanceof ApiClientError ? error.message : 'Could not reach the server.';
        setAuth({ kind: 'error', status, message });
      });
    const onHash = () => {
      setTab(tabFromHash());
    };
    window.addEventListener('hashchange', onHash);
    return () => {
      window.removeEventListener('hashchange', onHash);
    };
  }, []);

  if (auth.kind === 'loading') {
    return (
      <p class="muted" role="status">
        <span class="spinner" aria-hidden="true" /> Checking your access…
      </p>
    );
  }

  if (auth.kind === 'error') {
    return (
      <div class="callout callout--danger" role="alert">
        <div>
          <h2>{auth.status === 503 ? 'Admin isn’t set up yet' : 'You’re not signed in'}</h2>
          <p>{auth.message}</p>
          {auth.status !== 503 && (
            <button
              type="button"
              class="btn btn--small"
              onClick={() => {
                window.location.reload();
              }}
            >
              Sign in again
            </button>
          )}
        </div>
      </div>
    );
  }

  const counts: Partial<Record<TabId, number>> = summary.data
    ? {
        bookings: summary.data.pendingBookings,
        quotes: summary.data.newQuotes,
        applications: summary.data.newApplications,
        messages: summary.data.newMessages,
      }
    : {};

  return (
    <NotifyProvider>
      <div class="admin-shell">
        <div class="admin-top">
          <p class="small muted">
            Signed in as <strong>{auth.email}</strong>
          </p>
          {summary.data && (
            <ul class="admin-stats" role="list">
              <li>
                <span class="admin-stats__num">{summary.data.pendingBookings}</span> pending
              </li>
              <li>
                <span class="admin-stats__num">{summary.data.upcomingBookings}</span> upcoming
              </li>
              <li>
                <span class="admin-stats__num">{summary.data.newQuotes}</span> new quotes
              </li>
              <li>
                <span class="admin-stats__num">{summary.data.newMessages}</span> new messages
              </li>
            </ul>
          )}
        </div>
        <nav class="admin-tabs" aria-label="Admin sections">
          {TABS.map((t) => (
            <a key={t.id} href={`#${t.id}`} aria-current={tab === t.id ? 'page' : undefined}>
              {t.label}
              {counts[t.id] ? <span class="admin-tabs__count">{counts[t.id]}</span> : null}
            </a>
          ))}
        </nav>
        <div class="admin-panel">
          {tab === 'bookings' && <BookingsPanel today={today} onChanged={summary.reload} />}
          {tab === 'schedule' && <SchedulePanel today={today} />}
          {tab === 'quotes' && <QuotesPanel onChanged={summary.reload} />}
          {tab === 'applications' && <ApplicationsPanel onChanged={summary.reload} />}
          {tab === 'messages' && <MessagesPanel onChanged={summary.reload} />}
        </div>
      </div>
    </NotifyProvider>
  );
}
