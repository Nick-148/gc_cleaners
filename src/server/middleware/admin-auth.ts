import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { csv, environmentOf } from '../env';
import { ApiError } from '../errors';
import { log } from '../lib/log';
import type { AppEnv } from '../types';

/**
 * Admin authentication (ADR 0005): verifies the Cloudflare Access JWT ourselves and requires the
 * email to be on the ADMIN_EMAILS allowlist. Fails closed when Access isn't configured.
 */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const env = c.env;
  const devEmail = env.DEV_ADMIN_EMAIL?.trim().toLowerCase();
  if (environmentOf(env) === 'development' && devEmail) {
    c.set('adminEmail', devEmail);
    await next();
    return;
  }

  const allowlist = csv(env.ADMIN_EMAILS).map((e) => e.toLowerCase());
  const verifier = c.var.deps.access(env);
  if (!verifier || allowlist.length === 0) {
    log('error', 'admin.not_configured', { requestId: c.var.requestId });
    throw new ApiError(
      503,
      'admin_not_configured',
      'The admin area is not configured yet. See docs/deploy.md.',
    );
  }

  const token = c.req.header('cf-access-jwt-assertion') ?? getCookie(c, 'CF_Authorization');
  if (!token) throw new ApiError(401, 'unauthenticated', 'Please sign in to continue.');

  let email: string;
  try {
    ({ email } = await verifier.verify(token));
  } catch {
    log('warn', 'admin.invalid_token', { requestId: c.var.requestId });
    throw new ApiError(
      401,
      'unauthenticated',
      'Your session is invalid or has expired. Please sign in again.',
    );
  }
  if (!allowlist.includes(email)) {
    log('warn', 'admin.forbidden', { requestId: c.var.requestId });
    throw new ApiError(403, 'forbidden', 'This account does not have admin access.');
  }
  c.set('adminEmail', email);
  await next();
};
