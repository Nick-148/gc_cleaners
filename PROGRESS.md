# PROGRESS

Append-only work log, newest entry first. Each entry covers what changed, what was decided
(link the ADRs), and what's next.

---

## 2026-11-02: M1 complete (site, API, admin, tests, CI)

**Done**

- **API** (Hono on Pages Functions): slots; bookings with an atomic capacity check (a single
  conditional INSERT, proven by a concurrent-request test and a deliberate mutation check);
  quotes with magic-byte-validated photo uploads to private R2; applications; contact; and the
  full admin API with Access JWT verification, an allowlist, an audit log and fail-closed
  behavior (ADR 0004–0007).
- **Pages:** Home, Services & Rates (checklist labeled _Gordon policy_ vs _Our standard_), Fine
  Guide & FAQ (sourced fines with a verified date), Get a Quote, Book a Time, Work With Us (75%
  split table), Contact, Privacy, Terms, 404.
- **Islands** (Preact): booking widget (package → day/time → details → confirm, with an .ics
  download), quote form (client-side image downscaling, previews), application form, contact
  form, and the admin dashboard (bookings, schedule/rules/overrides/closures, quotes with photos,
  applications, messages).
- **Security:** Astro CSP with per-page hashes plus `_headers` (HSTS, frame-ancestors, and more),
  same-origin guard, Turnstile, honeypot, hashed-IP rate limits, size limits, no PII in logs.
- **Tests:** 96 unit, 62 integration (workerd + D1 + R2) and 30 e2e (Playwright + axe on every
  page, CSP console check, mobile overflow) all pass. Lint (type-checked typescript-eslint strict,
  plus jsx-a11y) and typecheck (3 tsconfigs) are clean.
- **CI** (`.gitlab-ci.yml`): verify → e2e → preview deploy, and a manual production deploy gated
  by `npm run check:launch`.
- **Docs:** README, deploy runbook, operations guide, API reference.

**Found and fixed during verification**

- axe caught the logo's accessible name not matching its visible text (WCAG 2.5.3).
- Prettier's Astro formatting removed spaces next to inline tags ("Venmo(@…)", "College.Scot-Free").
  Fixed with explicit `{' '}`. Reviews now scan the built HTML for glued text.
- Preact 11 types `<input>` as a union discriminated by `type`, so the field components now
  take a narrow, explicit prop list.
- `hono/cloudflare-pages` is deprecated, so the Functions entry calls `app.fetch` directly (ADR 0002).
- `wrangler pages dev --env-file` didn't apply variables, so the e2e server passes `--binding`
  flags (ADR 0010).
- Removed copy that would have committed the owner to unapproved policies (a re-clean promise,
  supplies for cleaners) and an unsourced claim about fines.

**Pre-commit code review** (high effort; 10 findings, all fixed)

- Admin "Restore" and "Undo no-show" could overbook a window. They now use the same atomic
  capacity check and return `409 slot_full` (new integration test; ADR 0004 updated).
- CI workflow rules meant preview deploys never ran for branches with an open MR. Switched to
  branch pipelines only.
- `wrangler.toml` top-level `ENVIRONMENT` now defaults to `production` (fail closed). Local
  development opts in via `.dev.vars`.
- `dev:api`/`preview` bind to 127.0.0.1 to match the Vite proxy.
- Quote form photo-limit race fixed. Quote photo R2 uploads now run concurrently with cleanup on failure.
- Admin: an invalid quote price now shows an error; filter selects have visible labels.
- Topic labels and building names moved to `src/config/site.ts` (single source). Exported hooks
  have explicit return types.

**Next**

- Owner: clear blockers B1–B7 (PLAN.md), then follow `docs/deploy.md`.
- Push to GitLab once the remote URL is provided (B2).

---

## 2026-11-02: Project kickoff

**Done**

- Asked the owner the initial clarifying questions and appended the answers to the spec
  (`docs/SPEC.md` → _Clarifications_). Brand: Scot-Free Cleaning. Prices: $30 room, $40 bathroom,
  $60 bundle. Admin dashboard + email alerts. Weekly schedule + admin overrides. Placeholder
  contact info. `*.pages.dev` for now. GitLab remote to come.
- Researched Gordon College's official Residence Life Policies page for inspection and fine facts
  (ADR 0011 lists each fact with its source).
- Chose the stack and pinned dependencies (ADR 0002, 0009). Notes:
  - `@cloudflare/vitest-pool-workers` is deprecated and replaced by `@cloudflare/vitest-plugin`.
  - TypeScript 7 isn't supported by typescript-eslint or astro check yet, so we stay on 6.0.3.
  - Moved wrangler to 4.153.0 to pick up the patched `undici` in miniflare.
  - npm 11 `allowScripts`: approved esbuild, workerd and fsevents only.
- Wrote AGENTS.md, ADRs 0001–0012, PLAN.md and the development skills.

**Next**

- Scaffold the build, schema and API, then pages, admin, tests and CI (see PLAN.md M1).
