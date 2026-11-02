import type { MiddlewareHandler } from 'hono';
import { rateLimits, type RateLimitBucket } from '../../config/site';
import { ApiError } from '../errors';
import { clientIp } from '../http';
import { log } from '../lib/log';
import { incrementRateLimit, pruneRateLimits } from '../repositories/ops';
import { DEFAULT_RATE_LIMIT_SALT, rateLimitKey, windowStart } from '../services/rate-limit-key';
import type { AppEnv, Deps } from '../types';

/** Attaches a request id and the injected dependencies to every request. */
export function requestContext(deps: Deps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const requestId = crypto.randomUUID();
    c.set('requestId', requestId);
    c.set('deps', deps);
    await next();
    c.header('X-Request-Id', requestId);
  };
}

/** Conservative defaults for every API response; individual routes may override CSP/caching. */
export const apiHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  const headers = c.res.headers;
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store');
  if (!headers.has('Content-Security-Policy')) {
    headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  }
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defense for every state-changing request (ADR 0005): the browser must report the
 * request as same-origin, or, for older browsers, send an Origin equal to our own.
 */
export const sameOriginForMutations: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) {
    await next();
    return;
  }
  const fetchSite = c.req.header('sec-fetch-site');
  const origin = c.req.header('origin');
  const allowed =
    fetchSite !== undefined
      ? fetchSite === 'same-origin'
      : origin !== undefined && origin === new URL(c.req.url).origin;
  if (!allowed) {
    throw new ApiError(403, 'cross_origin', 'Cross-site requests are not allowed.');
  }
  await next();
};

/** Fixed-window, per-IP rate limit backed by D1 (ADR 0006). */
export function rateLimit(bucket: RateLimitBucket): MiddlewareHandler<AppEnv> {
  const { limit, windowSeconds } = rateLimits[bucket];
  return async (c, next) => {
    const nowSeconds = Math.floor(c.var.deps.clock.now().getTime() / 1000);
    const start = windowStart(nowSeconds, windowSeconds);
    const key = await rateLimitKey(
      c.env.RATE_LIMIT_SALT?.trim() || DEFAULT_RATE_LIMIT_SALT,
      bucket,
      clientIp(c) ?? 'unknown',
    );
    const count = await incrementRateLimit(c.env.DB, key, start);
    if (count === 1) {
      // First hit of a new window for this key: a cheap, regular moment to drop stale counters.
      c.executionCtx.waitUntil(
        pruneRateLimits(c.env.DB, start - 86_400).catch(() => {
          log('warn', 'rate_limit.prune_failed', { requestId: c.var.requestId });
        }),
      );
    }
    if (count > limit) {
      log('warn', 'rate_limit.exceeded', { requestId: c.var.requestId, bucket });
      throw new ApiError(
        429,
        'rate_limited',
        'Too many requests from your network. Please wait a bit and try again.',
        undefined,
        { 'Retry-After': String(start + windowSeconds - nowSeconds) },
      );
    }
    await next();
  };
}
