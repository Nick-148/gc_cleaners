import { describe, expect, it, vi } from 'vitest';
import { csv, environmentOf, isEnabled } from '../../src/server/env';
import { escapeHtml, headerSafe } from '../../src/server/lib/html';
import { newReference, REFERENCE_ALPHABET } from '../../src/server/services/ids';
import { mailerFromEnv, ResendMailer } from '../../src/server/services/mailer';
import { rateLimitKey, windowStart } from '../../src/server/services/rate-limit-key';
import {
  CloudflareTurnstileVerifier,
  SITEVERIFY_URL,
  turnstileFromEnv,
} from '../../src/server/services/turnstile';
import { sniffImageType } from '../../src/server/services/uploads';

const bindings = { DB: {} as D1Database, UPLOADS: {} as R2Bucket };

describe('environmentOf', () => {
  it('treats unknown or missing values as production (fail closed)', () => {
    expect(environmentOf({ ENVIRONMENT: 'development' })).toBe('development');
    expect(environmentOf({ ENVIRONMENT: ' Preview ' })).toBe('preview');
    expect(environmentOf({ ENVIRONMENT: 'dev' })).toBe('production');
    expect(environmentOf({})).toBe('production');
  });

  it('parses list and boolean config values', () => {
    expect(csv(' a@x.com, ,b@x.com ')).toEqual(['a@x.com', 'b@x.com']);
    expect(csv(undefined)).toEqual([]);
    expect(isEnabled('TRUE')).toBe(true);
    expect(isEnabled('yes')).toBe(false);
  });
});

describe('html helpers', () => {
  it('escapes HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });

  it('strips header-injection characters', () => {
    expect(headerSafe('Hello\r\nBcc: victim@example.com')).toBe('Hello Bcc: victim@example.com');
  });
});

describe('newReference', () => {
  it('uses the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const ref = newReference('SF');
      expect(ref).toMatch(/^SF-.{6}$/);
      for (const ch of Array.from(ref.slice(3))) expect(REFERENCE_ALPHABET).toContain(ch);
    }
  });
});

describe('rate limit keys', () => {
  it('are salted SHA-256 hex digests that never contain the IP', async () => {
    const key = await rateLimitKey('salt', 'booking', '203.0.113.9');
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).toBe(await rateLimitKey('salt', 'booking', '203.0.113.9'));
    expect(key).not.toBe(await rateLimitKey('other-salt', 'booking', '203.0.113.9'));
    expect(key).not.toBe(await rateLimitKey('salt', 'quote', '203.0.113.9'));
  });

  it('aligns windows to fixed boundaries', () => {
    expect(windowStart(7_265, 3_600)).toBe(7_200);
    expect(windowStart(7_200, 3_600)).toBe(7_200);
  });
});

describe('sniffImageType', () => {
  const bytes = (...values: (number | string)[]): Uint8Array =>
    new Uint8Array(
      values.flatMap((v) => (typeof v === 'string' ? Array.from(v, (c) => c.charCodeAt(0)) : [v])),
    );

  it.each([
    ['jpeg', bytes(0xff, 0xd8, 0xff, 0xe1), 'image/jpeg'],
    ['png', bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a), 'image/png'],
    ['webp', bytes('RIFF', 0, 0, 0, 0, 'WEBP'), 'image/webp'],
    ['heic', bytes(0, 0, 0, 24, 'ftyp', 'heic'), 'image/heic'],
    ['heif (mif1)', bytes(0, 0, 0, 24, 'ftyp', 'mif1'), 'image/heif'],
  ])('detects %s', (_label, input, expected) => {
    expect(sniffImageType(input)).toBe(expected);
  });

  it.each([
    ['gif', bytes('GIF89a')],
    ['svg', bytes('<svg xmlns=')],
    ['mp4', bytes(0, 0, 0, 24, 'ftyp', 'isom')],
    ['html', bytes('<!doctype html>')],
    ['empty', bytes()],
  ])('rejects %s', (_label, input) => {
    expect(sniffImageType(input)).toBeNull();
  });
});

describe('CloudflareTurnstileVerifier', () => {
  const respond = (body: unknown, status = 200) =>
    vi.fn<(input: string, init: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(new Response(JSON.stringify(body), { status })),
    );

  it('posts the secret, token and IP to siteverify', async () => {
    const fetcher = respond({ success: true, hostname: 'scotfree.test' });
    const verifier = new CloudflareTurnstileVerifier('secret', [], fetcher);
    expect(await verifier.verify('tok', '203.0.113.9')).toEqual({ success: true, errorCodes: [] });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe(SITEVERIFY_URL);
    const form = init?.body as FormData;
    expect(form.get('secret')).toBe('secret');
    expect(form.get('response')).toBe('tok');
    expect(form.get('remoteip')).toBe('203.0.113.9');
  });

  it('passes through Cloudflare error codes', async () => {
    const verifier = new CloudflareTurnstileVerifier(
      's',
      [],
      respond({ success: false, 'error-codes': ['timeout-or-duplicate'] }),
    );
    expect(await verifier.verify('tok', undefined)).toEqual({
      success: false,
      errorCodes: ['timeout-or-duplicate'],
    });
  });

  it('enforces the hostname allowlist when configured', async () => {
    const verifier = new CloudflareTurnstileVerifier(
      's',
      ['scot-free-cleaning.pages.dev'],
      respond({ success: true, hostname: 'evil.example' }),
    );
    expect((await verifier.verify('tok', undefined)).success).toBe(false);
  });

  it('fails closed on HTTP and network errors', async () => {
    expect(
      (await new CloudflareTurnstileVerifier('s', [], respond({}, 500)).verify('t', undefined))
        .success,
    ).toBe(false);
    const broken = new CloudflareTurnstileVerifier('s', [], () =>
      Promise.reject(new Error('offline')),
    );
    expect(await broken.verify('t', undefined)).toEqual({
      success: false,
      errorCodes: ['network-error'],
    });
  });

  it('refuses test secrets outside development and tests', () => {
    const testSecret = '1x0000000000000000000000000000000AA';
    expect(
      turnstileFromEnv({
        ...bindings,
        ENVIRONMENT: 'development',
        TURNSTILE_SECRET_KEY: testSecret,
      }),
    ).not.toBeNull();
    expect(
      turnstileFromEnv({
        ...bindings,
        ENVIRONMENT: 'production',
        TURNSTILE_SECRET_KEY: testSecret,
      }),
    ).toBeNull();
    expect(
      turnstileFromEnv({ ...bindings, ENVIRONMENT: 'preview', TURNSTILE_SECRET_KEY: testSecret }),
    ).toBeNull();
    expect(
      turnstileFromEnv({
        ...bindings,
        ENVIRONMENT: 'production',
        TURNSTILE_SECRET_KEY: '0x4AAAAreal',
      }),
    ).not.toBeNull();
    expect(turnstileFromEnv({ ...bindings, ENVIRONMENT: 'production' })).toBeNull();
  });
});

describe('mailers', () => {
  it('falls back to the console mailer until Resend is configured', () => {
    expect(mailerFromEnv(bindings).kind).toBe('console');
    expect(mailerFromEnv({ ...bindings, RESEND_API_KEY: 'k' }).kind).toBe('console');
    expect(mailerFromEnv({ ...bindings, RESEND_API_KEY: 'k', MAIL_FROM: 'a@b.c' }).kind).toBe(
      'resend',
    );
  });

  it('sends through the Resend API with a sanitized subject', async () => {
    const fetcher = vi.fn<(input: string, init: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(new Response('{}', { status: 200 })),
    );
    await new ResendMailer('key', 'Scot-Free <alerts@example.com>', fetcher).send({
      to: 'owner@example.com',
      subject: 'Hi\r\nBcc: x@y.z',
      text: 't',
      html: '<p>h</p>',
      replyTo: 'student@example.edu',
    });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe('https://api.resend.com/emails');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer key');
    expect(JSON.parse(init?.body as string)).toEqual({
      from: 'Scot-Free <alerts@example.com>',
      to: ['owner@example.com'],
      subject: 'Hi Bcc: x@y.z',
      text: 't',
      html: '<p>h</p>',
      reply_to: 'student@example.edu',
    });
  });

  it('throws on a failed send so the caller can log it', async () => {
    const mailer = new ResendMailer('key', 'a@b.c', () =>
      Promise.resolve(new Response('nope', { status: 422 })),
    );
    await expect(mailer.send({ to: 'x@y.z', subject: 's', text: 't', html: 'h' })).rejects.toThrow(
      'HTTP 422',
    );
  });
});
