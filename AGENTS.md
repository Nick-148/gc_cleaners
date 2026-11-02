# AGENTS.md: Scot-Free Cleaning

Read this before changing anything. It applies to humans and AI agents alike.
Then read `PLAN.md` (what's next), the newest entries in `PROGRESS.md`, and any ADR in
`docs/adr/` that touches the area you're working in. The requirements are in `docs/SPEC.md`.

## What this is

A marketing and booking site for **Scot-Free Cleaning**, an independent student cleaning service
for Gordon College residents. Students book room or bathroom cleanings, request custom
quotes with photos, apply to work as cleaners, and contact the owner. Payment is taken
**in person only (cash or Venmo)**. The site never handles money.

**We are not affiliated with or endorsed by Gordon College.** Every page renders the
disclaimer from `src/components/Footer.astro`. Never remove it, never use Gordon's logo
or colors, and never write copy that implies an official relationship.

## Ground rules

1. **Stay inside this repository.** Don't read, copy or imitate code from elsewhere on the
   machine. Public docs and package sources in `node_modules/` are fine.
2. **Production quality.** Code should be secure, accessible (WCAG 2.2 AA), tested and observable.
   No quick hacks. If something has to be deferred, it goes in `PLAN.md`.
3. **Work autonomously.** Ask the owner only about real business decisions you can't
   default sensibly. Otherwise decide, write an ADR, and move on.
4. **Blocked rule.** If an external dependency blocks you (credentials, an account, an owner
   decision, a third-party outage), _do not stall_:
   1. Record the blocker in `PLAN.md` → _Blockers_ (what, why, who can unblock, date).
   2. Put the dependency behind an interface in `src/server/services/` and ship a safe stub
      (console/no-op/in-memory) that is selected automatically when config is missing.
   3. Add a `PROGRESS.md` entry and keep going with the next task.
      See `.claude/skills/handle-blocker/SKILL.md`.
5. **Keep the docs current as part of the same change:**
   - `PLAN.md`: roadmap, current status, blockers. Edit in place.
   - `PROGRESS.md`: append-only log, newest entry first, one entry per work session/commit group.
   - `docs/adr/NNNN-title.md`: one decision per file. Never rewrite an accepted ADR;
     supersede it with a new one and mark the old one `Superseded by NNNN`.
6. **Review before every commit.** Run `npm run verify`, then follow the checklist in
   `.claude/skills/pre-commit-review/SKILL.md`. Nothing gets committed without a review.

## Stack (see ADR 0002)

| Concern        | Choice                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------- |
| Hosting        | Cloudflare Pages (static assets + Pages Functions)                                       |
| Pages / UI     | Astro 7, static output, scoped CSS, Preact 11 islands for interactive UI                 |
| API            | Hono 4 mounted at `functions/api/[[route]].ts`                                           |
| Database       | Cloudflare D1 (SQLite), SQL migrations in `migrations/`                                  |
| File storage   | Cloudflare R2 (private bucket) for quote photos                                          |
| Validation     | Zod 4 schemas in `src/shared/schemas.ts`, shared by client and server                    |
| Bot protection | Cloudflare Turnstile + honeypot + D1-backed rate limiting                                |
| Admin auth     | Cloudflare Access, with the JWT verified in our code (`jose`)                            |
| Email          | `Mailer` interface: console in dev, Resend in prod (ADR 0007)                            |
| Tests          | Vitest (unit, node) · `@cloudflare/vitest-plugin` (integration) · Playwright + axe (e2e) |

## Commands

```bash
npm ci                     # install (exact pins; see ADR 0009 before adding deps)
npm run dev                # Astro dev server on :4321, proxies /api → :8788
npm run dev:api            # Pages Functions + local D1/R2 on :8788 (run alongside `dev`)
npm run db:migrate:local   # apply migrations to the local D1 database
npm run preview            # production build served by wrangler on :8788 (closest to prod)
npm run verify             # format check, lint, typecheck, unit + integration tests, build
npm run test:e2e           # Playwright + axe against a fresh production build (needs network for Turnstile)
npm run check:launch       # fails while any PLAN.md launch blocker is still stubbed
```

`npm run verify` must pass before every commit. CI (`.github/workflows/ci.yml`, ADR 0013) runs the same steps
plus e2e on every push, and handles preview and production deploys.

## Architecture map

```
functions/api/[[route]].ts   Pages Functions entry. Mounts the Hono app. No logic here.
migrations/                  D1 schema. Append-only; never edit a migration that has been applied.
public/_headers              Security headers for static assets (CSP lives in Astro config).
src/config/site.ts           ALL business constants: brand, contact, prices, booking rules, buildings.
src/content/                 Static copy data: Gordon policy facts (with sources), FAQ, checklists.
src/shared/                  Isomorphic code (browser + Workers). Standard Web APIs only. No DOM, no Node.
src/server/                  Workers-only code.
  app.ts                     createApp(): composes middleware and routes. Takes injectable deps.
  env.ts                     Bindings type + runtime config parsing (fails closed in production).
  middleware/                same-origin guard, request id, rate limiting, Access auth.
  services/                  Interfaces + implementations for external things (mail, Turnstile,
                             uploads, clock, ids). Stubs are selected when config is missing.
  repositories/              The only place SQL lives. Prepared statements with .bind() only.
  routes/public/, routes/admin/
src/components/              Astro components; `islands/` holds Preact components (client JS).
src/pages/                   One file per route. `admin/` is a client-side app behind Access.
tests/unit/                  Pure logic, run in Node.
tests/integration/           API tests in the real Workers runtime with D1 + R2 (Miniflare).
tests/e2e/                   Browser flows + axe accessibility scans.
```

## Coding standards

- **TypeScript strictest.** No `any`. No `!` non-null assertions outside tests. Prefer
  `unknown` + narrowing. Exported functions have explicit return types.
- **Validate at the boundary.** Every request body and query goes through a Zod schema from
  `src/shared/schemas.ts`. The browser forms use the _same_ schema for inline errors.
- **SQL:** repositories only, prepared statements with `.bind()` only, never string-built
  values. Capacity-sensitive writes must be atomic (single conditional statement or
  `db.batch`) — see ADR 0004.
- **Time:** booking windows are stored as campus-local date (`YYYY-MM-DD`) + time (`HH:MM`)
  in `America/New_York`; audit/created timestamps are ISO-8601 UTC. Use `src/shared/dates.ts`
  and inject `Clock` on the server; never call `Date.now()` in business logic.
- **Money** is integer cents everywhere. Format only at the edge (`formatUsd`).
- **Business constants** live in `src/config/site.ts`. No magic numbers in components or routes.
- **Gordon policy facts** (fines, inspection rules) live in `src/content/gordon-policy.ts`
  with a `source` URL and `verifiedOn` date. Never invent or round a figure. If you can't
  verify it, don't publish it.
- **Privacy:** never log PII (names, emails, phones, room numbers, free-text). Log ids,
  booking references, status codes. Escape user content in emails with `escapeHtml`.
- **Errors:** throw `ApiError(status, code, message)`. The global handler maps it to
  `{ "error": { "code", "message", "fields"? } }`. Never return stack traces.
- **Security:** API mutations require same-origin (`Origin`/`Sec-Fetch-Site`) and a Turnstile
  token (public) or a valid Access JWT (admin). Uploads are validated by magic bytes, not by
  extension or client MIME type. Admin endpoints fail closed if Access isn't configured.
- **Frontend:** Astro for static content, Preact islands only where interaction is needed.
  No inline `style=""` attributes and no third-party scripts other than Turnstile (CSP).
  Every input has a visible `<label>`. Errors go to an `aria-live` region and are tied to
  the field with `aria-describedby`. Everything is keyboard-operable.
- **Dependencies:** exact versions, releases at least 7 days old, install scripts need an
  explicit `allowScripts` approval. Justify every new runtime dependency in the PR/commit (ADR 0009).

## Testing expectations

- New logic in `src/shared` or a service gets unit tests in `tests/unit`.
- Every API route has integration tests for: the happy path, validation failure, the
  auth/Turnstile/origin rejection paths, and any capacity or concurrency rule.
- New pages or flows get an e2e test and pass the axe scan with no serious or critical violations.
- Bug fixes start with a failing test.

## Git

- Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`, `ci:`).
- `main` is always deployable. Work on short-lived branches when a remote exists.
- Never commit secrets. `.dev.vars` is git-ignored; `.dev.vars.example` documents the keys.
