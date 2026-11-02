import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { z } from 'zod';
import { fieldErrors } from '../shared/schemas';
import { ApiError } from './errors';
import type { AppEnv } from './types';

/** JSON request bodies are small; anything bigger is abuse (ADR 0006). */
export const JSON_BODY_LIMIT_BYTES = 32 * 1024;

export const jsonBodyLimit = bodyLimit({
  maxSize: JSON_BODY_LIMIT_BYTES,
  onError: () => {
    throw new ApiError(413, 'payload_too_large', 'That request is too large.');
  },
});

export const VALIDATION_MESSAGE = 'Please fix the highlighted fields and try again.';

export async function parseJson<S extends z.ZodType>(
  c: Context<AppEnv>,
  schema: S,
): Promise<z.output<S>> {
  const contentType = c.req.header('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new ApiError(415, 'unsupported_media_type', 'Requests must be sent as JSON.');
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError(400, 'invalid_json', 'The request body is not valid JSON.');
  }
  return validate(schema, body);
}

export function parseQuery<S extends z.ZodType>(c: Context<AppEnv>, schema: S): z.output<S> {
  return validate(schema, c.req.query());
}

export function validate<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(400, 'validation_failed', VALIDATION_MESSAGE, fieldErrors(result.error));
  }
  return result.data;
}

/** Client IP as reported by Cloudflare's edge. Absent in local development. */
export function clientIp(c: Context<AppEnv>): string | undefined {
  return c.req.header('cf-connecting-ip') ?? undefined;
}

export function requireParam(c: Context<AppEnv>, name: string): string {
  const value = c.req.param(name);
  if (!value || value.length > 64 || !/^[A-Za-z0-9-]+$/.test(value)) {
    throw new ApiError(404, 'not_found', 'Not found.');
  }
  return value;
}
