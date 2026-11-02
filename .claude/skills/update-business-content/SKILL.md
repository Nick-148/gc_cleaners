---
name: update-business-content
description: How to change prices, contact details, Venmo handle, booking rules, buildings, FAQ copy, or Gordon College fine/policy facts. Use for any content or business-constant change.
---

# Updating business content

| What                                       | Where                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| Brand, contact email/phone, Venmo handle   | `src/config/site.ts` → `site.contact` (clear `isPlaceholder` once real) |
| Prices, package contents, commission       | `src/config/site.ts` → `packages`, `commissionRate`                     |
| Booking rules (lead time, horizon, limits) | `src/config/site.ts` → `bookingRules`                                   |
| Residence halls and bathroom types         | `src/config/site.ts` → `buildings`                                      |
| Gordon inspection/fine facts               | `src/content/gordon-policy.ts`                                          |
| FAQ, cleaning tips                         | `src/content/faq.ts`                                                    |
| Inspection checklist                       | `src/content/checklists.ts`                                             |

## Rules

- **Prices** are integer cents. Changing a price doesn't change existing bookings, because
  bookings store a price snapshot.
- **Gordon facts must be verifiable.** Each entry needs the official `source` URL (gordon.edu)
  and a `verifiedOn` date. Re-verify at the start of each semester. If a figure isn't on an official
  page, don't publish it as Gordon policy. Our own cleaning standard goes in `checklists.ts`,
  clearly labeled as ours.
- **Never** imply affiliation with Gordon College or promise that students will pass inspection.
- Adding a **package**, status, quote space, class year or contact topic also requires a new
  migration that updates the matching `CHECK` constraint (see the `add-d1-migration` skill).
  **Buildings** are validated in application code only (no DB constraint), so adding one is a config change.
- Run `npm run verify`. Unit tests assert pricing invariants (bundle cheaper than the parts,
  commission math).
