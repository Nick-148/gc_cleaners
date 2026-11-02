/** Cloudflare's documented always-pass test site key, used when no real key is configured (PLAN.md B4). */
export const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA';

export const turnstileSiteKey: string =
  import.meta.env.PUBLIC_TURNSTILE_SITE_KEY?.trim() || TURNSTILE_TEST_SITE_KEY;
