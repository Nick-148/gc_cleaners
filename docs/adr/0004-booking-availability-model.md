# 0004. Booking availability: weekly rules + overrides, atomic capacity

- Status: Accepted
- Date: 2026-11-02

## Context

The owner chose a recurring weekly schedule that admins can override, for example by blocking a
day or adding extra windows during inspection week. Each window can take a limited number of jobs
at once (the number of available cleaners). Students must never be able to overbook a window, even
under concurrent requests.

## Decision

- **Time model.** Everything is in campus-local time, `America/New_York`. A window is identified
  by `date` (`YYYY-MM-DD`) plus `start_time` (`HH:MM`), with an `end_time`. Storing local wall-clock
  values avoids DST bugs. "Now" comes from an injectable `Clock`, converted with `Intl`.
- **Weekly rules** (`availability_rules`): weekday, start, end and capacity. Admins can edit them.
- **Overrides:**
  - `closures(date, reason)` closes a whole day.
  - `window_overrides(date, start_time, end_time, capacity, note)` replaces the capacity of a
    rule window on that date (`capacity = 0` closes it) or adds a one-off window.
- **Effective windows** for a date are rules for that weekday, then overrides applied by
  `start_time`, minus closures. The pure function in `src/shared/availability.ts` is used by
  both the API and its tests.
- **Bookable range** runs from `now + minLeadHours` (12) to `today + horizonDays` (28),
  both set in `src/config/site.ts`.
- **Atomic capacity check.** A booking is created with one statement,
  `INSERT INTO bookings … SELECT … WHERE (SELECT COUNT(*) FROM bookings WHERE date=? AND start_time=? AND status IN ('pending','confirmed')) < ?`.
  D1 executes statements serially, so this can't overbook. If no row is inserted, the response is `409 slot_full`.
  Capacity is computed in application code from rules and overrides at request time.
- **Per-customer limits:** at most one active booking per email per window, and at most 3
  active future bookings per email.
- **Lifecycle:** `pending` (just booked) → `confirmed` (admin acknowledged) → `completed` |
  `cancelled` | `no_show`. Only `pending` and `confirmed` consume capacity.

## Consequences

- Re-activating a booking from the admin dashboard (Restore a cancelled booking, Undo a no-show)
  goes through the same atomic capacity check. If the window has filled since, the API returns
  `409 slot_full` and the admin must add capacity with a date override first.
- If an admin lowers capacity below the bookings already made, existing bookings stay. The admin
  UI shows the window as over capacity so it can be handled by hand.
- Bathroom-only packages can't be booked in buildings with communal floor bathrooms
  (`src/config/site.ts` → `buildings[].bathroomType`), and the server enforces this.
