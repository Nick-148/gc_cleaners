# 0006. Abuse protection for public forms

- Status: Accepted
- Date: 2026-11-02

## Context

Public forms (book, quote with uploads, apply, contact) are spam and abuse targets. Bookings
also consume scarce capacity, so fake bookings are a denial-of-service risk to the business.

## Decision

Defense in depth:

1. **Cloudflare Turnstile** on every public form. The server verifies tokens with
   `siteverify`, checks `success` and `hostname`, and fails closed in production if the secret
   is missing. Tests use Cloudflare's documented test keys, and the verifier is an interface.
2. **Honeypot field** (`company`), hidden from humans and assistive tech. If it's filled in,
   the server returns a fake success and stores nothing.
3. **Rate limiting** (`rate_limits` table in D1, fixed window), keyed by
   `SHA-256(salt + client IP + bucket)` so raw IPs are never stored. Limits per hour per IP:
   bookings 10, quotes 5, applications 5, contact 10. Rows are pruned opportunistically.
   We also recommend a Cloudflare WAF rate-limit rule on `/api/*` (`docs/deploy.md`).
4. **Size limits:** JSON bodies are capped at 32 KB. Quote uploads allow at most 5 images,
   10 MB each and 30 MB in total, enforced before parsing where possible.
5. **Uploads** are validated by magic bytes (JPEG, PNG, WebP, HEIC/HEIF). Files are stored
   under server-generated keys with the sniffed content type, and never served publicly.
6. **Same-origin requirement** on all mutating API requests (see ADR 0005).
7. **Business limits** on bookings per email (ADR 0004).

## Consequences

- E2E tests run with the Turnstile always-pass test key. Production needs real keys (launch blocker).
- A determined attacker with many IPs can still create pending bookings. Admins can cancel them,
  and the per-email limits slow this down. Revisit this if abuse is observed.
