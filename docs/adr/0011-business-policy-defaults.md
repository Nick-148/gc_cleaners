# 0011. Business policy defaults (chosen without asking; owner may overturn)

- Status: Accepted
- Date: 2026-11-02

## Context

The spec leaves several operational policies open. Per the dev workflow, we pick sensible
defaults instead of blocking, record them here, and keep them configurable.

## Decision

All values below live in `src/config/site.ts` unless noted.

- **Payment:** cash or Venmo, in person, due on completion. The site never collects payment data.
- **Cancellation/rescheduling:** free with at least 24 hours' notice through the contact page.
  Late cancellations or no-shows may be declined future bookings. No fees, because we collect nothing online.
- **Booking window:** at least 12 hours ahead and at most 28 days ahead.
- **Access to rooms:** a resident must be present to let the cleaner in. We never borrow keys or
  ID cards (a safety and liability default). Customers never need to provide supplies.
  **Open question for the owner:** whether the business or the cleaner funds supplies. The site
  deliberately makes no promise to cleaners about this.
- **Default schedule** (migration `0002`): weekdays 4–8 PM, Saturdays 10 AM–4 PM, Sundays 2–6 PM,
  with two jobs per window. The owner can edit it in the admin dashboard.
- **No-shows** (Terms): if nobody is there within 15 minutes of the window starting, the visit may
  count as a no-show. Problems with a visit should be reported within 24 hours.
- **No guarantee:** copy must never promise that a student will pass inspection or avoid fines.
  We promise a thorough clean against a published checklist. Terms state this explicitly.
- **Bathroom package** is offered only where the student has a private or suite bathroom
  (suite and apartment buildings). Communal floor bathrooms in traditional halls are the college's
  responsibility.
- **Quote photos:** up to 5 images, 10 MB each (30 MB total), deleted after 90 days.
- **Data retention:** contact messages, quotes and unsuccessful applications are kept for 1 year.
  Bookings are kept 2 years for bookkeeping. A purge job is on the roadmap (PLAN.md).
- **Gordon policy facts** are sourced only from gordon.edu with a `verifiedOn` date, and are
  re-verified each semester. Facts verified on 2026-11-02 from the Residence Life Policies page
  (`https://www.gordon.edu/studenthandbook/reslife`):
  - staff inspect rooms in the first two weeks of each semester, then violations carry a $25 fine
  - improper checkout carries a $30 fine
  - candles, incense and similar items carry a $100 fine
  - removed window screens carry a $25 fine
  - removing college furniture carries a fine of at least $25
  - students are responsible for any damages or custodial requirements not reported on the
    Room Condition Inventory
  - apartments are thoroughly inspected at least once a semester, and cleaning or repair costs
    for excessive wear are charged to the occupants
- **Cleaner compensation:** 75% of the job price goes to the cleaner (from the spec).

## Consequences

The owner should review this ADR before launch (PLAN.md checklist).
