---
name: deploy-cloudflare
description: Provisioning and deploying the site to Cloudflare Pages (D1, R2, Turnstile, Access, secrets) and running production migrations. Use for deploys, environment setup, or production incidents.
---

# Deploying to Cloudflare Pages

The full runbook is `docs/deploy.md`. Summary:

1. **One-time provisioning** (needs the owner's Cloudflare account; PLAN.md B3–B6):
   ```bash
   npx wrangler login
   npx wrangler d1 create scot-free-cleaning          # copy database_id into wrangler.toml
   npx wrangler r2 bucket create scot-free-cleaning-uploads
   npx wrangler r2 bucket lifecycle add scot-free-cleaning-uploads expire-quotes quotes/ --expire-days 90
   npx wrangler pages project create scot-free-cleaning --production-branch main
   ```
   Then create the Turnstile widget and the Access application, and set the secrets listed in `docs/deploy.md`.
2. **Every deploy** (CI does this on `main`):
   ```bash
   npm ci && npm run verify && npm run check:launch
   npx wrangler d1 migrations apply DB --remote --env production
   npx wrangler pages deploy dist --project-name scot-free-cleaning --branch main
   ```
3. **Smoke test:** `GET /api/health` returns `{"ok":true}`. Then book a test slot, see it in
   `/admin`, cancel it, and confirm the alert email arrived.
4. **Rollback:** in the Pages dashboard, promote the previous deployment. For data, use D1
   Time Travel (`npx wrangler d1 time-travel restore DB --env production --timestamp <ISO>`).
