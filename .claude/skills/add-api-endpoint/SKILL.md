---
name: add-api-endpoint
description: Step-by-step recipe for adding or changing an API route (public or admin) in the Hono app on Cloudflare Pages Functions, including validation, security, repository, and tests.
---

# Adding an API endpoint

The API is a Hono app built in `src/server/app.ts`, mounted at `functions/api/[[route]].ts`.
All routes live under `/api`.

1. **Schema first.** Add request/response schemas to `src/shared/schemas.ts` (requests) and
   types to `src/shared/api-types.ts` (responses). Limit string lengths, trim, and use enums
   from `src/config/site.ts`.
2. **Repository.** Put SQL in `src/server/repositories/<entity>.ts`. Use prepared statements
   with `.bind()`, and make capacity-sensitive writes atomic (one statement or `db.batch`).
   Map snake_case rows to camelCase DTOs here.
3. **Route.** Add it to `src/server/routes/public/*.ts` or `src/server/routes/admin/*.ts`.
   - Public mutations: apply `rateLimit(bucket)`, verify Turnstile (`deps.turnstile.verify`),
     and check the honeypot. The same-origin guard is global.
   - Admin routes are mounted under the `requireAdmin` middleware. Record every mutation with
     `audit(c, action, entityType, entityId)`.
   - Parse with `parseJson(c, schema)` / `parseQuery(c, schema)`, which throw a 400 with field errors.
   - Throw `ApiError` for expected failures. Never return raw errors.
   - Send notifications with `c.executionCtx.waitUntil(...)` _after_ the write succeeds.
4. **Wire it** in the router file's `register*Routes` function.
5. **Tests** in `tests/integration/<area>.test.ts`:
   happy path · validation 400 · origin 403 · Turnstile failure 400 · rate limit 429 (public) ·
   no/invalid JWT 401/403 (admin) · domain rules (e.g. capacity 409).
6. **Client.** Call it through `src/components/islands/lib/api.ts`, which handles JSON, errors
   and the Turnstile token.
7. Update `docs/api.md` with the method, path, request, responses and errors.
