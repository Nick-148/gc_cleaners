# PLAN

Roadmap and current status. Edit in place. The history lives in `PROGRESS.md`, and the decisions in `docs/adr/`.

_Last updated: 2026-11-02_

## Current status

**Phase: M1 complete. M2 (launch) is blocked on external setup.** The site, API and admin
dashboard are built and verified locally: 96 unit, 62 integration and 30 end-to-end tests pass,
axe reports no serious violations, and the CSP is clean. The code is on GitHub (`main` at `github.com/Nick-148/gc_cleaners`, public). Nothing is deployed yet. Launch is
waiting on the owner-side items in **Blockers** below; `npm run check:launch` lists what remains.

## Milestones

### M0: Foundations ✅

- [x] Clarifying questions answered and appended to the spec (`docs/SPEC.md`)
- [x] Stack chosen and dependencies pinned (ADR 0002, 0009)
- [x] AGENTS.md, skills, ADRs, PLAN, PROGRESS

### M1: MVP (feature-complete, locally verified) ✅

- [x] Project scaffold: Astro static + Pages Functions + D1/R2 bindings, lint/format/typecheck
- [x] Database schema + migrations (bookings, availability, quotes, photos, applications, messages, audit, rate limits)
- [x] Public pages: Home, Services & Rates (with inspection checklist), Get a Quote, Book a Time,
      Work With Us, FAQ / Fine Guide, Contact, Privacy, Terms, 404
- [x] Public API: slots, bookings, quotes (+photo upload), applications, contact, health
- [x] Admin dashboard: bookings, availability (rules + overrides + closures), quotes (+photos), applications, messages
- [x] Abuse protection: Turnstile, honeypot, rate limiting, same-origin guard, size limits
- [x] Email notifications (Mailer interface; console stub until configured)
- [x] Tests: unit, integration (Workers runtime), e2e + axe
- [x] GitLab CI: verify, e2e, preview deploys, and a manual production deploy gated by `check:launch`
      (written for GitLab; the code now lives on GitHub, see M2)
- [x] Deploy and operations docs (`docs/deploy.md`, `docs/operations.md`, `docs/api.md`)

### M2: Launch

- [ ] Clear every item in **Blockers** below
- [ ] CI/CD on GitHub: the repo is hosted at `github.com/Nick-148/gc_cleaners`, where `.gitlab-ci.yml`
      does not run. Port the pipeline to GitHub Actions (or mirror the repo to GitLab)
- [ ] Owner reviews ADR 0011 (policy defaults, including the open question of who funds supplies),
      the site copy, and the Terms and Privacy drafts (ideally with someone qualified)
- [ ] Provision production D1/R2, run migrations, set secrets, configure Access, deploy (`docs/deploy.md`)
- [ ] Smoke test on production: book → admin sees it → email alert arrives
- [ ] Lighthouse at least 95 on Performance, Accessibility, Best Practices and SEO for Home and Book

### M3: After launch (backlog)

- [ ] Data-retention purge (scheduled Worker or admin button) per ADR 0011
- [ ] Customer confirmation and reminder emails once a domain is verified (ADR 0007)
- [ ] Self-service cancel/reschedule link in confirmation emails (signed token)
- [ ] Cleaner assignment and payout report (75% split) in the admin dashboard
- [ ] CSV export of bookings for bookkeeping
- [ ] Admin lists: real pagination beyond 200 rows, and search by email or reference
- [ ] Re-verify Gordon policy facts each semester (`src/content/gordon-policy.ts` → `policyVerifiedOn`)
- [ ] Pin CI container images by digest (currently pinned by exact tag)
- [ ] Revisit Pages vs Workers with static assets if Pages support narrows (ADR 0002 note)

## Blockers

These are external dependencies, each stubbed per ADR 0012. Each one blocks **launch**, not development.

| #   | Blocker                                                                                      | Stub in place                                                                                                       | Who unblocks                                      | Added      |
| --- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------- |
| B1  | **Real contact details and Venmo handle** (email, phone/text, @venmo)                        | Reserved placeholders in `src/config/site.ts`; `isPlaceholder` shows a preview banner and blocks production deploys | Owner                                             | 2026-11-02 |
| B3  | **Cloudflare resources**: Pages project, D1 database ids, R2 buckets + 90-day lifecycle rule | Local Miniflare D1/R2; placeholder `database_id`s in `wrangler.toml`; CI deploy jobs skipped                        | Owner (Cloudflare account) using `docs/deploy.md` | 2026-11-02 |
| B4  | **Turnstile site key and secret**                                                            | Cloudflare's documented test keys locally; preview/production refuse test secrets and fail closed (503)             | Owner (Cloudflare dashboard)                      | 2026-11-02 |
| B5  | **Cloudflare Access application** for `/admin*` and `/api/admin/*` + `ADMIN_EMAILS`          | `DEV_ADMIN_EMAIL` bypass in development only; elsewhere admin returns 503 until configured                          | Owner                                             | 2026-11-02 |
| B6  | **Email provider (Resend) + verified sending domain**                                        | `ConsoleMailer` logs a redacted line instead of sending                                                             | Owner (needs a domain)                            | 2026-11-02 |
| B7  | **Custom domain** (optional)                                                                 | `*.pages.dev`                                                                                                       | Owner                                             | 2026-11-02 |
