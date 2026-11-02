# 0010. Testing strategy

- Status: Accepted
- Date: 2026-11-02

## Decision

Three layers, all run in CI:

1. **Unit** (`tests/unit`, Vitest in Node): pure logic such as availability computation, date
   math, pricing, schemas, file sniffing, escaping and the rate-limit key derivation.
2. **Integration** (`tests/integration`, `@cloudflare/vitest-plugin`): the Hono app running in the
   real `workerd` runtime with Miniflare D1 + R2. Migrations are applied in setup and storage is
   reset between tests. External services (Turnstile, Resend, Access JWKS) are replaced with fakes
   injected into `createApp()`. Admin JWTs are signed with a test key pair to exercise the real
   verification code.
3. **End-to-end** (`tests/e2e`, Playwright): runs against `wrangler pages dev` serving the
   production build with a fresh local D1 and Turnstile test keys. Covers each public flow and
   runs an axe scan (no serious or critical violations) on every page.

E2E notes (learned 2026-11-02):

- The Turnstile widget and `siteverify` both run against Cloudflare with the documented test keys,
  so e2e needs outbound network access. CI retries once to absorb rare network blips.
- `wrangler pages dev --env-file` did not load variables in wrangler 4.153, so
  `scripts/e2e-server.mjs` passes `tests/e2e/e2e.env` as explicit `--binding` flags.
- `networkidle` never settles on pages with Turnstile. Tests wait for the island fallbacks to disappear instead.

Coverage goal: every API route covers its happy path, validation failure, auth/origin/Turnstile
rejection, and any capacity rule. The shared logic aims for at least 90% line coverage.

## Consequences

- Fast feedback locally (`npm test` for unit + integration). E2E takes longer and also runs in CI.
- Faking external services is possible only because they sit behind interfaces (AGENTS.md blocked rule).
