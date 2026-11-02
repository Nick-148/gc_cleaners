/**
 * Worker bindings and runtime configuration (ADR 0005–0007).
 * Unknown or missing ENVIRONMENT values are treated as production, so misconfiguration fails closed.
 */

export interface Bindings {
  DB: D1Database;
  UPLOADS: R2Bucket;
  ENVIRONMENT?: string;
  // Turnstile (ADR 0006)
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_ALLOWED_HOSTNAMES?: string;
  // Cloudflare Access (ADR 0005)
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ADMIN_EMAILS?: string;
  DEV_ADMIN_EMAIL?: string;
  // Email (ADR 0007)
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  NOTIFY_EMAIL?: string;
  SEND_CUSTOMER_EMAILS?: string;
  // Rate limiting (ADR 0006)
  RATE_LIMIT_SALT?: string;
}

export type Environment = 'development' | 'test' | 'preview' | 'production';

export function environmentOf(env: Pick<Bindings, 'ENVIRONMENT'>): Environment {
  switch (env.ENVIRONMENT?.trim().toLowerCase()) {
    case 'development':
      return 'development';
    case 'test':
      return 'test';
    case 'preview':
      return 'preview';
    default:
      return 'production';
  }
}

/** Splits a comma-separated config value, trimming and dropping blanks. */
export function csv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function isEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}
