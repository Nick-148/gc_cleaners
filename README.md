# Scot-Free Cleaning

Website for **Scot-Free Cleaning**, an independent, student-run room and bathroom cleaning
service for Gordon College residents. Students book cleaning slots, request custom quotes with
photos, apply to work as cleaners, and pay in person with cash or Venmo.

> Scot-Free Cleaning is not affiliated with, endorsed by, or sponsored by Gordon College.

- **Requirements:** [`docs/SPEC.md`](docs/SPEC.md)
- **How we work, and the architecture map:** [`AGENTS.md`](AGENTS.md)
- **Roadmap, status and launch blockers:** [`PLAN.md`](PLAN.md) · **Log:** [`PROGRESS.md`](PROGRESS.md)
- **Decisions:** [`docs/adr/`](docs/adr/)
- **Deploying:** [`docs/deploy.md`](docs/deploy.md) · **Running the business:** [`docs/operations.md`](docs/operations.md) · **API:** [`docs/api.md`](docs/api.md)

## Stack

Astro 7 (static) + Preact islands on **Cloudflare Pages**, with a Hono API on Pages Functions,
**D1** (SQLite) for data, **R2** for quote photos, **Turnstile** for bot protection and
**Cloudflare Access** for the admin dashboard.

## Getting started

Requires Node 24 (`.nvmrc`).

```bash
npm ci
cp .dev.vars.example .dev.vars        # local-only settings; test keys, admin bypass
npm run db:migrate:local              # create the local D1 database
```

Run the site with a live API (two terminals):

```bash
npm run dev:api     # Pages Functions + local D1/R2 on http://127.0.0.1:8788
```

```bash
npm run dev         # Astro dev server on http://127.0.0.1:4321 (proxies /api)
```

Open http://127.0.0.1:4321. The admin dashboard is at `/admin`. Locally you're signed in
as `DEV_ADMIN_EMAIL`. In production, Cloudflare Access protects it.

> `npm run dev:api` serves the last production build from `dist/`, so run `npm run build` once
> first. To try everything exactly as it will run in production, use `npm run preview` (port 8788).

## Quality gates

```bash
npm run verify      # format check, lint, typecheck, unit + integration tests, build
npm run test:e2e    # Playwright + axe against the production build (needs network for Turnstile)
```

| Suite       | What it covers                                                                                                          | Where               |
| ----------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Unit        | Dates/DST, availability, pricing, schemas, upload sniffing, escaping, Turnstile/Resend clients                          | `tests/unit`        |
| Integration | Every API route in the real Workers runtime with D1 + R2: capacity and concurrency, auth, CSRF, rate limits, uploads    | `tests/integration` |
| End-to-end  | Booking → admin confirm, quote with photos, apply, contact, validation and focus, axe on every page, CSP, mobile layout | `tests/e2e`         |

## Project layout

See the architecture map in [`AGENTS.md`](AGENTS.md#architecture-map).
