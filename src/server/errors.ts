import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiErrorBody } from '../shared/api-types';
import { log } from './lib/log';
import type { AppEnv } from './types';

/** An expected failure with a stable machine-readable `code` and a user-facing `message`. */
export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function errorBody(
  code: string,
  message: string,
  requestId: string | undefined,
  fields?: Record<string, string>,
): ApiErrorBody {
  return {
    error: {
      code,
      message,
      ...(fields ? { fields } : {}),
      ...(requestId ? { requestId } : {}),
    },
  };
}

export function handleError(err: unknown, c: Context<AppEnv>): Response {
  const requestId = c.get('requestId');
  if (err instanceof ApiError) {
    if (err.headers) for (const [k, v] of Object.entries(err.headers)) c.header(k, v);
    return c.json(errorBody(err.code, err.message, requestId, err.fields), err.status);
  }
  if (err instanceof HTTPException) {
    const status = err.status;
    const code = status === 413 ? 'payload_too_large' : 'http_error';
    const message =
      status === 413 ? 'That upload is too large.' : 'The request could not be processed.';
    return c.json(errorBody(code, message, requestId), status);
  }
  log('error', 'request.unhandled_error', {
    requestId,
    path: new URL(c.req.url).pathname,
    method: c.req.method,
    error: err instanceof Error ? err.name : typeof err,
    detail: err instanceof Error ? err.message.slice(0, 300) : undefined,
  });
  return c.json(
    errorBody('internal_error', 'Something went wrong on our end. Please try again.', requestId),
    500,
  );
}
