# 0003. D1 for records, private R2 bucket for photos

- Status: Accepted
- Date: 2026-11-02

## Context

We store bookings, availability rules and overrides, quote requests, job applications,
contact messages and an admin audit log, plus photos attached to quote requests.
The volume is small: one campus, roughly thousands of rows a year.

## Decision

- **Cloudflare D1** (SQLite) is the system of record. The schema is managed with
  `wrangler d1 migrations` in `migrations/`, and migrations are append-only.
- All SQL lives in `src/server/repositories/`, always as prepared statements with `.bind()`.
- Quote photos go to a **private R2 bucket** (binding `UPLOADS`) under
  `quotes/{quoteId}/{photoId}`. They're never publicly readable. Admins view them through
  `/api/admin/quotes/:id/photos/:photoId`, which streams them with `nosniff` and a sandboxed CSP.
- An **R2 lifecycle rule deletes objects after 90 days** (ADR 0011). The admin UI treats a
  missing object as "expired".
- Primary keys are random UUIDs. Customers see a short booking reference such as `SF-7K2Q9M`.

## Consequences

- No ORM: the SQL is explicit and reviewable, and the repositories are the only coupling to D1.
- D1 has no interactive transactions, so capacity checks use a single conditional `INSERT … SELECT`
  (ADR 0004).
- Backups: D1 Time Travel gives 30-day point-in-time restore. Document restores in `docs/operations.md`.
