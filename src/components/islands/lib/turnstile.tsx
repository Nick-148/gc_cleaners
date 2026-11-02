/** Cloudflare Turnstile widget, rendered explicitly so it works inside Preact islands (ADR 0006). */
import { useEffect, useRef, useState } from 'preact/hooks';
import { turnstileSiteKey } from './public-env';
import { site } from '../../../config/site';
import { FieldError } from './fields';

interface TurnstileOptions {
  sitekey: string;
  action: string;
  theme: 'auto' | 'light' | 'dark';
  'response-field': boolean;
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
}

interface TurnstileApi {
  render(element: HTMLElement, options: TurnstileOptions): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptPromise: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      resolve();
    };
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Turnstile failed to load'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

interface Props {
  /** Turnstile action label (letters, digits, - and _). */
  action: string;
  onToken: (token: string | null) => void;
  /** Increment to reset the widget; tokens are single-use. */
  resetKey: number;
  error?: string | undefined;
}

export function Turnstile({ action, onToken, resetKey, error }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const [loadFailed, setLoadFailed] = useState(false);
  // Exposed as data-state so the UI (and e2e tests) can tell when verification has completed.
  const [state, setState] = useState<'pending' | 'verified' | 'error'>('pending');

  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then(() => {
        if (cancelled || !container.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(container.current, {
          sitekey: turnstileSiteKey,
          action,
          theme: 'auto',
          'response-field': false,
          callback: (token) => {
            setState('verified');
            onTokenRef.current(token);
          },
          'expired-callback': () => {
            setState('pending');
            onTokenRef.current(null);
          },
          'error-callback': () => {
            setState('error');
            onTokenRef.current(null);
          },
        });
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [action]);

  useEffect(() => {
    if (resetKey === 0) return;
    setState('pending');
    onTokenRef.current(null);
    if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
  }, [resetKey]);

  return (
    <div
      class="field turnstile"
      id="turnstileToken"
      tabIndex={-1}
      data-invalid={error ? 'true' : undefined}
      data-state={state}
      data-testid="turnstile"
    >
      <span class="field__label">Quick check that you’re a person</span>
      <div ref={container} class="turnstile__widget" />
      {loadFailed && (
        <p class="field__error" role="alert">
          The verification check couldn’t load. Try turning off content blockers for this site, or
          email us at {site.contact.email}.
        </p>
      )}
      <FieldError id="turnstileToken" error={error} />
    </div>
  );
}
