# API reference

All endpoints are under `/api`, return JSON, and send `Cache-Control: no-store` plus a
restrictive CSP. Every response has an `X-Request-Id` header.

**Errors** always look like this:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "User-facing text",
    "fields": { "email": "…" },
    "requestId": "…"
  }
}
```

**Mutations** (POST/PUT/PATCH/DELETE) must be same-origin (`Sec-Fetch-Site: same-origin`, or a
matching `Origin`). Otherwise the API returns `403 cross_origin`.

Request schemas live in `src/shared/schemas.ts` and response types in `src/shared/api-types.ts`.

## Public

| Method | Path                            | Body                                                                | Success                                                 | Notable errors                                                                                                                                                                               |
| ------ | ------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/health`                       |                                                                     | `200 {ok:true}`                                         |                                                                                                                                                                                              |
| GET    | `/slots?from=YYYY-MM-DD&days=N` |                                                                     | `200 SlotsResponse` (days ≤ 29, clamped to the horizon) | `400`                                                                                                                                                                                        |
| POST   | `/bookings`                     | JSON `bookingRequestSchema`                                         | `201 BookingCreatedResponse`                            | `400 validation_failed` · `400 verification_failed` · `409 slot_unavailable` / `slot_full` / `already_booked` / `too_many_bookings` · `413` · `415` · `429` · `503 verification_unavailable` |
| POST   | `/quotes`                       | multipart: text fields from `quoteRequestSchema` + up to 5 `photos` | `201 {reference}`                                       | `400 unsupported_photo_type` / `too_many_photos` · `413 photo_too_large` / `photos_too_large` · `415` · `429`                                                                                |
| POST   | `/applications`                 | JSON `applicationRequestSchema`                                     | `201 {ok:true}`                                         | `400` · `429`                                                                                                                                                                                |
| POST   | `/contact`                      | JSON `contactRequestSchema`                                         | `201 {ok:true}`                                         | `400` · `429`                                                                                                                                                                                |

All public POSTs need a `turnstileToken`. The honeypot field `company` must be empty. If it isn't,
the API returns a plausible success and stores nothing.

## Admin (Cloudflare Access JWT + `ADMIN_EMAILS`)

Requests without a valid token get `401`. A valid token for an email not on the allowlist gets
`403`. If Access isn't configured, the response is `503 admin_not_configured`. Every mutation
writes an `audit_log` row.

| Method | Path                                          | Notes                                                                                                   |
| ------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| GET    | `/admin/me`                                   | `{email}`                                                                                               |
| GET    | `/admin/summary`                              | Counts for the dashboard header                                                                         |
| GET    | `/admin/bookings?from&to&status&limit&offset` | Ordered by date and time                                                                                |
| PATCH  | `/admin/bookings/:id`                         | `{status?, adminNotes?}`                                                                                |
| GET    | `/admin/availability`                         | Rules, plus overrides and closures from today on                                                        |
| GET    | `/admin/schedule?from&days`                   | Effective windows with booked counts (≤ 62 days)                                                        |
| POST   | `/admin/availability/rules`                   | `{weekday, startTime, endTime, capacity, active?}`; `409` if the start time already exists for that day |
| PUT    | `/admin/availability/rules/:id`               | Same body                                                                                               |
| DELETE | `/admin/availability/rules/:id`               |                                                                                                         |
| POST   | `/admin/availability/overrides`               | `{date, startTime, endTime, capacity, note?}`; capacity `0` closes the window                           |
| DELETE | `/admin/availability/overrides/:id`           |                                                                                                         |
| POST   | `/admin/availability/closures`                | `{date, reason?}` (upsert)                                                                              |
| DELETE | `/admin/availability/closures/:date`          |                                                                                                         |
| GET    | `/admin/quotes?status&limit&offset`           | Includes photo metadata                                                                                 |
| PATCH  | `/admin/quotes/:id`                           | `{status?, quotedCents?, adminNotes?}`                                                                  |
| GET    | `/admin/quotes/:id/photos/:photoId`           | Streams the image with a sandboxed CSP; `410 photo_expired` after the lifecycle deletion                |
| GET    | `/admin/applications?status&limit&offset`     |                                                                                                         |
| PATCH  | `/admin/applications/:id`                     | `{status?, adminNotes?}`                                                                                |
| GET    | `/admin/messages?status&limit&offset`         |                                                                                                         |
| PATCH  | `/admin/messages/:id`                         | `{status}`                                                                                              |
