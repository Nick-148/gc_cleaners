/** Cloudflare Access JWT verification (ADR 0005). */
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Bindings } from '../env';

export interface AccessIdentity {
  email: string;
}

export interface AccessVerifier {
  /** Resolves to the verified identity, or rejects for any invalid, expired or mis-addressed token. */
  verify(token: string): Promise<AccessIdentity>;
}

export function createAccessVerifier(options: {
  issuer: string;
  audience: string;
  keySet: JWTVerifyGetKey;
}): AccessVerifier {
  return {
    async verify(token: string): Promise<AccessIdentity> {
      const { payload } = await jwtVerify(token, options.keySet, {
        issuer: options.issuer,
        audience: options.audience,
        algorithms: ['RS256'],
        clockTolerance: 30,
      });
      const email = payload.email;
      if (typeof email !== 'string' || !email.includes('@')) {
        throw new Error('Access token has no email claim');
      }
      return { email: email.trim().toLowerCase() };
    },
  };
}

const TEAM_DOMAIN_RE = /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/;

// JWKS fetchers are cached per isolate so keys aren't refetched on every request.
const keySets = new Map<string, JWTVerifyGetKey>();

/** Returns null when Access isn't configured, which makes admin routes fail closed. */
export function accessFromEnv(env: Bindings): AccessVerifier | null {
  const issuer = env.ACCESS_TEAM_DOMAIN?.trim().replace(/\/+$/, '').toLowerCase();
  const audience = env.ACCESS_AUD?.trim();
  if (!issuer || !audience || !TEAM_DOMAIN_RE.test(issuer)) return null;
  let keySet = keySets.get(issuer);
  if (!keySet) {
    keySet = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    keySets.set(issuer, keySet);
  }
  return createAccessVerifier({ issuer, audience, keySet });
}
