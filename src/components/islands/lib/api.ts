/** Browser-side API client. All requests are same-origin; errors become ApiClientError. */
import type { ApiErrorBody } from '../../../shared/api-types';

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

const NETWORK_MESSAGE = 'We couldn’t reach the server. Check your connection and try again.';

function fallbackMessage(status: number): string {
  if (status === 413) return 'That upload is too large.';
  if (status === 429) return 'Too many attempts. Please wait a bit and try again.';
  if (status >= 500) return 'Something went wrong on our end. Please try again in a moment.';
  return 'The request couldn’t be completed. Please try again.';
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: 'same-origin', ...init });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiClientError(0, 'network_error', NETWORK_MESSAGE);
  }
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!response.ok) {
    const body = (data as Partial<ApiErrorBody> | null)?.error;
    throw new ApiClientError(
      response.status,
      body?.code ?? 'http_error',
      body?.message ?? fallbackMessage(response.status),
      body?.fields ?? {},
    );
  }
  return data as T;
}

export function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });
}

export function sendJson<T>(
  path: string,
  body: unknown,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST',
): Promise<T> {
  return request<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? null : JSON.stringify(body),
  });
}

export function sendForm<T>(path: string, form: FormData): Promise<T> {
  return request<T>(path, { method: 'POST', headers: { Accept: 'application/json' }, body: form });
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiClientError ? error.message : NETWORK_MESSAGE;
}
