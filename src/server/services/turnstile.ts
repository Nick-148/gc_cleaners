/** Cloudflare Turnstile server-side verification (ADR 0006). */
import { csv, environmentOf, type Bindings } from '../env';

export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Cloudflare's documented dummy secrets. Never acceptable outside development and tests. */
const TEST_SECRET_PREFIXES = [
  '1x0000000000000000000000000000000',
  '2x0000000000000000000000000000000',
  '3x0000000000000000000000000000000',
];

export interface TurnstileOutcome {
  success: boolean;
  errorCodes: string[];
}

export interface TurnstileVerifier {
  verify(token: string, remoteIp: string | undefined): Promise<TurnstileOutcome>;
}

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

export class CloudflareTurnstileVerifier implements TurnstileVerifier {
  constructor(
    private readonly secret: string,
    private readonly allowedHostnames: readonly string[],
    // Wrapped so the global isn't invoked unbound (which throws "Illegal invocation" in Workers).
    private readonly fetcher: Fetcher = (input, init) => fetch(input, init),
  ) {}

  async verify(token: string, remoteIp: string | undefined): Promise<TurnstileOutcome> {
    const body = new FormData();
    body.set('secret', this.secret);
    body.set('response', token);
    if (remoteIp) body.set('remoteip', remoteIp);

    let response: Response;
    try {
      response = await this.fetcher(SITEVERIFY_URL, {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      return { success: false, errorCodes: ['network-error'] };
    }
    if (!response.ok) return { success: false, errorCodes: [`http-${response.status}`] };

    const data: unknown = await response.json().catch(() => null);
    if (typeof data !== 'object' || data === null) {
      return { success: false, errorCodes: ['invalid-response'] };
    }
    const result = data as { success?: unknown; 'error-codes'?: unknown; hostname?: unknown };
    if (result.success !== true) {
      const codes = Array.isArray(result['error-codes'])
        ? result['error-codes'].filter((c): c is string => typeof c === 'string')
        : [];
      return { success: false, errorCodes: codes };
    }
    if (
      this.allowedHostnames.length > 0 &&
      (typeof result.hostname !== 'string' || !this.allowedHostnames.includes(result.hostname))
    ) {
      return { success: false, errorCodes: ['hostname-mismatch'] };
    }
    return { success: true, errorCodes: [] };
  }
}

/** Returns null (→ 503) when Turnstile isn't configured, or when a test secret is used in preview/production. */
export function turnstileFromEnv(env: Bindings): TurnstileVerifier | null {
  const secret = env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return null;
  const environment = environmentOf(env);
  const isTestSecret = TEST_SECRET_PREFIXES.some((prefix) => secret.startsWith(prefix));
  if (isTestSecret && (environment === 'production' || environment === 'preview')) return null;
  return new CloudflareTurnstileVerifier(secret, csv(env.TURNSTILE_ALLOWED_HOSTNAMES));
}
