import type { Bindings } from './env';
import type { AccessVerifier } from './services/access';
import type { Clock } from './services/clock';
import type { Mailer } from './services/mailer';
import type { TurnstileVerifier } from './services/turnstile';

/**
 * External dependencies, injected so tests can replace them (ADR 0010, 0012).
 * Factories receive the per-request bindings because Pages passes `env` per request.
 * A factory returning `null` means "not configured"; callers fail closed.
 */
export interface Deps {
  clock: Clock;
  turnstile: (env: Bindings) => TurnstileVerifier | null;
  mailer: (env: Bindings) => Mailer;
  access: (env: Bindings) => AccessVerifier | null;
}

export interface AppEnv {
  Bindings: Bindings;
  Variables: {
    requestId: string;
    deps: Deps;
    adminEmail: string;
  };
}
