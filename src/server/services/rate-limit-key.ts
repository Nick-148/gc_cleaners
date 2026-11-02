/** Salt used only if RATE_LIMIT_SALT is unset. Production should set its own (docs/deploy.md). */
export const DEFAULT_RATE_LIMIT_SALT = 'scot-free-cleaning:rate-limit:v1';

/** SHA-256(salt | bucket | ip) as hex, so raw IP addresses are never stored (ADR 0006). */
export async function rateLimitKey(salt: string, bucket: string, ip: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}|${bucket}|${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Start of the fixed window containing `nowSeconds`. */
export function windowStart(nowSeconds: number, windowSeconds: number): number {
  return nowSeconds - (nowSeconds % windowSeconds);
}
