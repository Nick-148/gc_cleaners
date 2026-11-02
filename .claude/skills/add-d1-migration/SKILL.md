---
name: add-d1-migration
description: How to change the D1 database schema safely with wrangler migrations. Use for any new table, column, index, or data fix.
---

# Changing the database schema

1. **Never edit an existing migration** once it's committed. Always add a new one.
2. Create the file: `npx wrangler d1 migrations create DB <snake_case_description>`.
   This writes `migrations/NNNN_<description>.sql`.
3. Write forward-only, idempotent-where-possible SQL:
   - `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`
   - Add a `CHECK` constraint for every enum column, mirroring `src/config/site.ts`
   - For new NOT NULL columns, add a `DEFAULT` (SQLite can't add NOT NULL without one)
   - Timestamps are `TEXT` ISO-8601 UTC. Money is `INTEGER` cents. IDs are `TEXT` UUIDs.
4. Apply it locally with `npm run db:migrate:local`.
5. Update the repository and DTOs in `src/server/repositories/` and `src/shared/api-types.ts`.
6. Integration tests apply all migrations automatically (`tests/integration/setup.ts`), so
   run `npm run test:integration`.
7. Production (after review and merge): `npx wrangler d1 migrations apply DB --remote --env production`.
   This runs in CI before deploy (`.gitlab-ci.yml`). D1 Time Travel is the rollback path
   (`docs/operations.md`).
