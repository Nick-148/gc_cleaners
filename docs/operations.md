# Operations guide

Day-to-day running of Scot-Free Cleaning. Written for the owner, not developers.

## Daily: the admin dashboard (`/admin`)

Sign in through Cloudflare Access (one-time PIN to your email, or Google if you enabled it).

| Tab              | What to do                                                                                                                                                                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bookings**     | New bookings arrive as **pending**. Press **Confirm** once a cleaner is lined up, and put their name in _Internal notes_. After the visit, press **Mark completed** (or **No-show**). **Cancel** frees the spot for someone else.                                                            |
| **Schedule**     | _Weekly schedule_ is the recurring windows. _Capacity_ is how many jobs can run at once, usually the number of cleaners available. Use **Date overrides** to add extra windows or change capacity for one date (capacity 0 closes that window), and **Closed days** for breaks and holidays. |
| **Quotes**       | Look at the photos, email the student a price (the email link pre-fills the subject), then enter the price and press **Save price**. The status becomes _quoted_.                                                                                                                            |
| **Applications** | Review new cleaners and move them through _interviewing → hired_ or _declined_.                                                                                                                                                                                                              |
| **Messages**     | Reschedule and cancel requests come here with the booking reference. Handle them, then press **Mark handled**.                                                                                                                                                                               |

Tips:

- The **Next 14 days** table on Schedule shows booked / capacity for every window. Red rows are
  over capacity (for example, after you lowered capacity). Sort those out by hand.
- Before inspection week or checkout, add date overrides with extra capacity.

## Payment

Collected in person when the job is done, by cash or Venmo. The site never handles money.
Cleaners keep 75% of each job (Room $22.50, Bathroom $30, Bundle $45).

## Data retention (ADR 0011)

- Quote photos delete themselves after 90 days (R2 lifecycle rule).
- Keep bookings up to 2 years, and messages, quotes and unsuccessful applications up to 1 year.
  An automated purge is on the roadmap (PLAN.md M3). Until then, delete old rows on request:
  ```bash
  npx wrangler d1 execute DB --remote --env production --command "DELETE FROM messages WHERE created_at < '2025-11-01'"
  ```
- If someone asks to see or delete their data, find them by email (`SELECT … WHERE email = '…'`),
  then export or delete within 30 days, as the Privacy page promises.

## Each semester

- Re-check the fine amounts and rules against the official
  [Residence Life Policies](https://www.gordon.edu/studenthandbook/reslife). Update
  `src/content/gordon-policy.ts` and its `policyVerifiedOn` date.
- Review the weekly schedule and the list of residence halls.

## When something goes wrong

| Symptom                                                        | Likely cause                                        | Fix                                                               |
| -------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| Forms say "Online forms are temporarily unavailable"           | Turnstile secret missing or wrong                   | Re-set `TURNSTILE_SECRET_KEY` (docs/deploy.md §2)                 |
| Admin says "Admin isn't set up yet"                            | Access vars or `ADMIN_EMAILS` missing               | docs/deploy.md §3                                                 |
| Admin says "This account does not have admin access"           | Your email isn't in `ADMIN_EMAILS`                  | Add it, and make sure the Access policy matches                   |
| No alert emails                                                | Resend not configured, or the domain isn't verified | docs/deploy.md §4. Bookings are still saved, so check `/admin`.   |
| A quote photo says "deleted under our 90-day retention policy" | Expected after 90 days                              | Nothing to fix                                                    |
| Spam bookings                                                  | A bot got through                                   | Cancel them in `/admin`. Consider a stricter WAF rate-limit rule. |

Logs: go to **Workers & Pages → scot-free-cleaning → Functions → Real-time logs**. Logs never
contain personal data. Search by `requestId` (every API response has an `X-Request-Id` header) or
by booking reference.
