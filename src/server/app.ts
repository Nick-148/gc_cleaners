import { Hono } from 'hono';
import { errorBody, handleError } from './errors';
import { requireAdmin } from './middleware/admin-auth';
import { apiHeaders, requestContext, sameOriginForMutations } from './middleware/core';
import { registerAdminRoutes } from './routes/admin';
import { registerPublicRoutes } from './routes/public';
import { accessFromEnv } from './services/access';
import { systemClock } from './services/clock';
import { mailerFromEnv } from './services/mailer';
import { turnstileFromEnv } from './services/turnstile';
import type { AppEnv, Deps } from './types';

export const defaultDeps: Deps = {
  clock: systemClock,
  turnstile: turnstileFromEnv,
  mailer: mailerFromEnv,
  access: accessFromEnv,
};

/** Builds the API. Tests pass fakes for external services via `overrides` (ADR 0010). */
export function createApp(overrides: Partial<Deps> = {}): Hono<AppEnv> {
  const deps: Deps = { ...defaultDeps, ...overrides };
  const app = new Hono<AppEnv>().basePath('/api');

  app.use('*', requestContext(deps));
  app.use('*', apiHeaders);
  app.use('*', sameOriginForMutations);

  registerPublicRoutes(app);

  const admin = new Hono<AppEnv>();
  admin.use('*', requireAdmin);
  registerAdminRoutes(admin);
  app.route('/admin', admin);

  app.notFound((c) => c.json(errorBody('not_found', 'Not found.', c.get('requestId')), 404));
  app.onError(handleError);
  return app;
}
