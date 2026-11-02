# 0002. Astro static site + Hono on Cloudflare Pages Functions

- Status: Accepted
- Date: 2026-11-02

## Context

The site must deploy to **Cloudflare Pages**. Most pages are marketing content that rarely
changes. A small set of features needs a server: slot availability, bookings, quote uploads,
job applications, contact messages and an admin dashboard.

Options considered:

1. **Astro SSR via the Cloudflare adapter.** Every page is server-rendered by a Worker. This
   couples the marketing pages to the runtime, spends a Function invocation on every page view,
   and ties us to the adapter's support for Pages vs. Workers, which has been changing.
2. **Next.js on Pages (next-on-pages).** Heavy, its support is in flux, and it would be overkill
   for this scope.
3. **Astro static output + Pages Functions for `/api/*` only.** Pages are prerendered HTML served
   from the CDN. Only API calls invoke Functions.

## Decision

Option 3.

- Astro 7 with `output: 'static'` builds `dist/`.
- `functions/api/[[route]].ts` mounts a **Hono** app (`src/server/app.ts`). Pages generates
  `_routes.json` so that only `/api/*` invokes a Function. The entry calls `app.fetch()`
  directly instead of using `hono/cloudflare-pages`, which Hono 4.13 marks deprecated (to be removed
  in Hono 5, because Cloudflare now recommends Workers with static assets).
- Interactive UI (booking calendar, forms, admin dashboard) is built from **Preact islands**
  hydrated on the client (ADR 0008).
- We deliberately stay on Pages, not Workers static assets, because the owner asked for Pages.
  If we ever migrate, the Hono app moves over unchanged.

## Consequences

- Marketing pages are fast, cacheable, and keep working if the API is degraded.
- The admin dashboard is a static shell plus client-side app; its data comes from `/api/admin/*`.
- The API is a plain `fetch` handler, so it's easy to test in the Workers runtime (ADR 0010).
- Local development runs two processes: `astro dev` (UI) and `wrangler pages dev` (API).
