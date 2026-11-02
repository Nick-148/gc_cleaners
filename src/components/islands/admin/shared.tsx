import type { ComponentChildren } from 'preact';
import { createContext } from 'preact';
import { useCallback, useContext, useEffect, useRef, useState } from 'preact/hooks';
import { errorMessage, getJson } from '../lib/api';

export interface Resource<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** Fetches JSON from an admin endpoint and refetches whenever `path` changes. */
export function useResource<T>(path: string): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getJson<T>(path, controller.signal)
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(errorMessage(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, [path, nonce]);

  const reload = useCallback(() => {
    setNonce((n) => n + 1);
  }, []);
  return { data, error, loading, reload };
}

/** Announces the result of admin actions to screen readers and sighted users. */
export const NotifyContext = createContext<(message: string, tone?: 'success' | 'error') => void>(
  () => undefined,
);

export type Notify = (message: string, tone?: 'success' | 'error') => void;

export function useNotify(): Notify {
  return useContext(NotifyContext);
}

export function NotifyProvider({ children }: { children: ComponentChildren }) {
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const notify = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    setToast({ message, tone });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setToast(null);
    }, 5000);
  }, []);
  return (
    <NotifyContext.Provider value={notify}>
      {children}
      <div class="admin-toast-region" role="status" aria-live="polite">
        {toast && <div class={`admin-toast admin-toast--${toast.tone}`}>{toast.message}</div>}
      </div>
    </NotifyContext.Provider>
  );
}

export function LoadState({
  resource,
  empty,
  children,
}: {
  resource: Resource<unknown>;
  empty?: boolean;
  children: ComponentChildren;
}) {
  if (resource.error) {
    return (
      <div class="callout callout--danger" role="alert">
        <p>
          {resource.error}{' '}
          <button type="button" class="btn btn--small btn--secondary" onClick={resource.reload}>
            Retry
          </button>
        </p>
      </div>
    );
  }
  if (resource.loading && resource.data === null) {
    return (
      <p class="muted" role="status">
        <span class="spinner" aria-hidden="true" /> Loading…
      </p>
    );
  }
  if (empty) return <p class="muted">Nothing here yet.</p>;
  return <>{children}</>;
}

export function StatusBadge({ status }: { status: string }) {
  return <span class={`status status--${status}`}>{status.replace('_', ' ')}</span>;
}

export function formatTimestamp(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** Runs an async admin action with a busy flag and success/error notifications. */
export interface Action {
  busy: boolean;
  run: (action: () => Promise<unknown>, success: string, after?: () => void) => Promise<boolean>;
}

export function useAction(): Action {
  const notify = useNotify();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (
      action: () => Promise<unknown>,
      success: string,
      after?: () => void,
    ): Promise<boolean> => {
      setBusy(true);
      try {
        await action();
        notify(success, 'success');
        after?.();
        return true;
      } catch (error) {
        notify(errorMessage(error), 'error');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [notify],
  );
  return { busy, run };
}

/** Admin notes editor that saves on demand. */
export function NotesEditor({
  id,
  initial,
  onSave,
  busy,
}: {
  id: string;
  initial: string | null;
  onSave: (value: string | null) => void;
  busy: boolean;
}) {
  const [value, setValue] = useState(initial ?? '');
  const dirty = (initial ?? '') !== value;
  return (
    <div class="field admin-notes">
      <label class="field__label" htmlFor={`notes-${id}`}>
        Internal notes
      </label>
      <textarea
        id={`notes-${id}`}
        class="textarea"
        rows={2}
        maxLength={2000}
        value={value}
        onInput={(e) => {
          setValue(e.currentTarget.value);
        }}
      />
      {dirty && (
        <button
          type="button"
          class="btn btn--small"
          disabled={busy}
          onClick={() => {
            onSave(value.trim() === '' ? null : value.trim());
          }}
        >
          Save notes
        </button>
      )}
    </div>
  );
}
