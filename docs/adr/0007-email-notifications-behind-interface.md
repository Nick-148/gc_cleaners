# 0007. Email notifications behind a Mailer interface

- Status: Accepted
- Date: 2026-11-02

## Context

The owner wants an email alert for every new submission. There's no domain yet (the site launches on
`*.pages.dev`), and most providers require a verified sending domain to email arbitrary customers.

## Decision

- `Mailer` interface in `src/server/services/mailer.ts` with two implementations:
  - `ConsoleMailer`: logs a redacted summary (recipient domain, subject) and sends nothing. It's
    used when email isn't configured.
  - `ResendMailer`: calls the Resend HTTP API. It's selected when `RESEND_API_KEY` and `MAIL_FROM`
    are set.
- **Owner alerts** go to `NOTIFY_EMAIL` for every booking, quote, application and message.
- **Customer confirmations** are sent only when `SEND_CUSTOMER_EMAILS=true`, which requires a verified domain.
  Until then, customers get an on-screen confirmation with their booking reference.
- Emails are sent with `waitUntil` after the record is committed, so a mail outage never loses
  or blocks a submission. Failures are logged without PII.
- All user-supplied values are HTML-escaped in templates, and subjects strip CR/LF.

## Consequences

- Launching without email works. Alerts start as soon as the secrets are added (launch blocker).
- Switching provider means writing a new `Mailer` implementation. Callers don't change.
