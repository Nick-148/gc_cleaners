# 0005. Admin authentication via Cloudflare Access, verified in code

- Status: Accepted
- Date: 2026-11-02

## Context

The owner needs a private dashboard. Building our own password auth (hashing, sessions, resets,
MFA) is risky and unnecessary. Cloudflare Access (Zero Trust, free for up to 50 users) provides
SSO and one-time-PIN login in front of any path.

## Decision

- A Cloudflare Access application protects `/admin*` and `/api/admin/*` on the production domain
  and on `*.pages.dev`.
- **We don't trust the edge alone.** Middleware `src/server/middleware/admin-auth.ts` verifies the
  `Cf-Access-Jwt-Assertion` JWT on every admin API request. It checks the RS256 signature against
  the team JWKS (`https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, cached), `aud` equal to
  `ACCESS_AUD`, `iss` equal to the team domain, and expiry. It also requires the email claim to be
  in `ADMIN_EMAILS`.
- **Fails closed:** if `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` or `ADMIN_EMAILS` is missing, admin
  endpoints return `503 admin_not_configured`.
- **Local development only:** when `ENVIRONMENT=development` _and_ `DEV_ADMIN_EMAIL` is set, the
  middleware accepts that identity without a JWT. Any other environment ignores the bypass.
- **CSRF:** Access authenticates with a cookie, so every non-GET API request must be same-origin
  (`Origin` matches the host, or `Sec-Fetch-Site: same-origin`) and send `Content-Type:
application/json` or `multipart/form-data` from our own forms.
- Every admin mutation writes an `audit_log` row (actor email, action, entity, timestamp).

## Consequences

- No passwords stored by us. Admin access is managed in the Cloudflare dashboard.
- Operational setup is documented in `docs/deploy.md`. It's a launch blocker until done.
