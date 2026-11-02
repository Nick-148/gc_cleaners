import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import type { Bindings } from '../../src/server/env';
import { createApp } from '../../src/server/app';
import { createAccessVerifier } from '../../src/server/services/access';
import { fixedClock } from '../../src/server/services/clock';
import type { Mailer, MailMessage } from '../../src/server/services/mailer';
import type { TurnstileVerifier } from '../../src/server/services/turnstile';
import type { Deps } from '../../src/server/types';

/**
 * Monday 2026-11-02 09:00 in Wenham (EST, UTC-5).
 * With a 12-hour lead time the first bookable window is Tuesday 2026-11-03 16:00.
 */
export const NOW = '2026-11-02T14:00:00.000Z';
export const FIRST_BOOKABLE_DATE = '2026-11-03';

export const PASS_TOKEN = 'turnstile-pass';
export const OWNER_EMAIL = 'owner@example.com';
export const ADMIN_EMAIL = 'admin@example.com';
export const ACCESS_ISSUER = 'https://scotfree-test.cloudflareaccess.com';
export const ACCESS_AUD = 'test-audience-tag';

export class CapturingMailer implements Mailer {
  readonly kind = 'console';
  readonly sent: MailMessage[] = [];
  send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }
}

export const fakeTurnstile: TurnstileVerifier = {
  verify: (token) =>
    Promise.resolve(
      token === PASS_TOKEN
        ? { success: true, errorCodes: [] }
        : { success: false, errorCodes: ['invalid-input-response'] },
    ),
};

const keyPairPromise = generateKeyPair('RS256', { extractable: true });

async function accessKeySet(): Promise<ReturnType<typeof createLocalJWKSet>> {
  const { publicKey } = await keyPairPromise;
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
  return createLocalJWKSet({ keys: [jwk] });
}

/** Signs an Access-style JWT. Override claims to produce invalid tokens. */
export async function accessToken(
  claims: { email?: string; aud?: string; iss?: string; expiresIn?: string } = {},
): Promise<string> {
  const { privateKey } = await keyPairPromise;
  return new SignJWT({ email: claims.email ?? ADMIN_EMAIL })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(claims.iss ?? ACCESS_ISSUER)
    .setAudience(claims.aud ?? ACCESS_AUD)
    .setIssuedAt()
    .setExpirationTime(claims.expiresIn ?? '5m')
    .sign(privateKey);
}

export interface TestHarness {
  mailer: CapturingMailer;
  env: Bindings;
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
  json: <T = unknown>(
    path: string,
    body: unknown,
    init?: RequestInit,
  ) => Promise<{ res: Response; data: T }>;
}

/**
 * Builds the app with fakes for every external service and returns helpers that send
 * same-origin requests (like our own pages do) and wait for background work to finish.
 */
export async function harness(
  options: { deps?: Partial<Deps>; env?: Partial<Bindings>; now?: string } = {},
): Promise<TestHarness> {
  const mailer = new CapturingMailer();
  const keySet = await accessKeySet();
  const app = createApp({
    clock: fixedClock(options.now ?? NOW),
    turnstile: () => fakeTurnstile,
    mailer: () => mailer,
    access: () => createAccessVerifier({ issuer: ACCESS_ISSUER, audience: ACCESS_AUD, keySet }),
    ...options.deps,
  });
  const testEnv: Bindings = {
    ...env,
    NOTIFY_EMAIL: OWNER_EMAIL,
    ADMIN_EMAILS: `${ADMIN_EMAIL}, second@example.com`,
    ...options.env,
  };

  const fetchFn = async (path: string, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers);
    if (!headers.has('sec-fetch-site') && !headers.has('origin')) {
      headers.set('sec-fetch-site', 'same-origin');
    }
    const ctx = createExecutionContext();
    const res = await app.request(
      `https://scotfree.test${path}`,
      { ...init, headers },
      testEnv,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    return res;
  };

  return {
    mailer,
    env: testEnv,
    fetch: fetchFn,
    json: async <T>(path: string, body: unknown, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      headers.set('content-type', 'application/json');
      const res = await fetchFn(path, {
        method: 'POST',
        ...init,
        headers,
        body: JSON.stringify(body),
      });
      return { res, data: (await res.json()) as T };
    },
  };
}

export function validBooking(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    package: 'room',
    date: FIRST_BOOKABLE_DATE,
    startTime: '16:00',
    name: 'Jordan Rivera',
    email: 'jordan@example.edu',
    phone: '978-555-0123',
    building: 'chase',
    room: '214B',
    paymentPreference: 'venmo',
    notes: 'Please knock twice.',
    agreePayment: true,
    agreePolicies: true,
    turnstileToken: PASS_TOKEN,
    ...overrides,
  };
}

/** Smallest valid JPEG header bytes followed by filler; enough for magic-byte sniffing. */
export function jpegBytes(size = 1024): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  return bytes;
}
