# Deploying to Cloudflare Pages

This runbook takes the project from "runs locally" to "live on Cloudflare". Each step names the
launch blocker it clears (`PLAN.md` → _Blockers_). `npm run check:launch` reports what's left.

You need a Cloudflare account (the free plan is enough) and Node 24. Run commands from the repo root.

```bash
npx wrangler login
```

## 1. Create the resources (B3)

```bash
# Databases: one for production, one for preview deployments
npx wrangler d1 create scot-free-cleaning
npx wrangler d1 create scot-free-cleaning-preview

# Private photo buckets, with automatic deletion after 90 days (ADR 0003, 0011)
npx wrangler r2 bucket create scot-free-cleaning-uploads
npx wrangler r2 bucket create scot-free-cleaning-uploads-preview
npx wrangler r2 bucket lifecycle add scot-free-cleaning-uploads expire-quote-photos quotes/ --expire-days 90
npx wrangler r2 bucket lifecycle add scot-free-cleaning-uploads-preview expire-quote-photos quotes/ --expire-days 90

# The Pages project
npx wrangler pages project create scot-free-cleaning --production-branch main
```

Copy each `database_id` printed by `d1 create` into `wrangler.toml`, under `[[env.production.d1_databases]]`
and `[[env.preview.d1_databases]]`. Then apply the schema:

```bash
npx wrangler d1 migrations apply DB --remote --env production
npx wrangler d1 migrations apply DB --remote --env preview
```

## 2. Turnstile (B4)

In the Cloudflare dashboard, go to **Turnstile → Add widget**:

- Hostnames: `scot-free-cleaning.pages.dev` (plus your custom domain later)
- Mode: Managed

Keep the **site key** for the build, and store the **secret key** as a secret:

```bash
npx wrangler pages secret put TURNSTILE_SECRET_KEY --project-name scot-free-cleaning
```

Set `PUBLIC_TURNSTILE_SITE_KEY` as a GitHub Actions variable (see step 6). It's baked into the
static build. `TURNSTILE_ALLOWED_HOSTNAMES` in `wrangler.toml` adds a server-side hostname check.

## 3. Admin access with Cloudflare Access (B5)

1. Go to **Zero Trust → Settings → Custom pages** and pick a team name. Your team domain will be
   `https://<team>.cloudflareaccess.com`.
2. Go to **Zero Trust → Access → Applications → Add → Self-hosted** and create an application:
   - Application domain: `scot-free-cleaning.pages.dev`, with **two paths**: `admin*` and `api/admin/*`
   - Session duration: 24 hours
   - Policy: **Allow** → Include → Emails → the owner's email (and any staff)
   - Identity: One-time PIN works out of the box; add Google login if you want
3. Copy the application's **AUD tag**.
4. In `wrangler.toml` → `[env.production.vars]`, set:
   ```toml
   ACCESS_TEAM_DOMAIN = "https://<team>.cloudflareaccess.com"
   ACCESS_AUD = "<aud tag>"
   ```
5. Set the admin allowlist as a secret. It must match the Access policy:
   ```bash
   npx wrangler pages secret put ADMIN_EMAILS --project-name scot-free-cleaning   # e.g. owner@gmail.com,helper@gordon.edu
   ```

The API verifies the Access JWT itself and checks the allowlist (ADR 0005). If anything is
missing it returns `503 admin_not_configured` rather than letting anyone in. Do the same for
`--env preview` if you want an admin area on preview deployments.

## 4. Email alerts (B6)

Until this step, alerts are logged instead of sent, and nothing breaks.

1. Create a [Resend](https://resend.com) account and verify a sending domain (this requires a
   domain, B7).
2. Set the secrets and vars:
   ```bash
   npx wrangler pages secret put RESEND_API_KEY --project-name scot-free-cleaning
   npx wrangler pages secret put NOTIFY_EMAIL --project-name scot-free-cleaning     # where alerts go
   ```
   In `wrangler.toml` → `[env.production.vars]`, set `MAIL_FROM = "Scot-Free Cleaning <alerts@yourdomain>"`.
3. Once the domain is verified, set `SEND_CUSTOMER_EMAILS = "true"` to send booking
   confirmations to students.

## 5. Other secrets

```bash
# Salt for hashing IPs in rate limiting. Any long random string.
openssl rand -hex 32 | npx wrangler pages secret put RATE_LIMIT_SALT --project-name scot-free-cleaning
```

Repeat the `secret put` commands with `--env preview` for preview deployments. You can use
Turnstile test keys there.

## 6. CI/CD (GitHub Actions)

The pipeline is `.github/workflows/ci.yml` (ADR 0013). In the GitHub repo, go to
**Settings → Secrets and variables → Actions** and add:

| Kind     | Name                        | Value                                                                 |
| -------- | --------------------------- | --------------------------------------------------------------------- |
| Secret   | `CLOUDFLARE_API_TOKEN`      | API token with **Account → Cloudflare Pages: Edit** and **D1: Edit**  |
| Variable | `CLOUDFLARE_ACCOUNT_ID`     | From the Cloudflare dashboard sidebar (this turns the deploy jobs on) |
| Variable | `PUBLIC_TURNSTILE_SITE_KEY` | The Turnstile site key                                                |

Then in **Settings → Environments**:

- Create `production` and add yourself under **Required reviewers**. Production deploys then wait
  for your approval. Optionally restrict it to the `main` branch.
- Create `preview` (no protection needed).

And in **Settings → Branches**, add a rule for `main` that requires the **Verify** and
**End-to-end** checks and pull requests before merging.

The pipeline then:

- runs **Verify** and **End-to-end** on every push to any branch
- deploys other branches to `https://<branch>.scot-free-cleaning.pages.dev`, using the preview D1/R2
- deploys `main` to production after your approval. That job runs `npm run check:launch` first, so
  it refuses while any blocker remains

## 7. Before the first production deploy (M2)

- [ ] Replace the placeholder contact details in `src/config/site.ts` and set `isPlaceholder: false` (B1)
- [ ] Owner reviews ADR 0011, the Terms and the Privacy page
- [ ] `npm run check:launch` passes with the production `PUBLIC_TURNSTILE_SITE_KEY` set
- [ ] Recommended: in **Security → WAF → Rate limiting rules**, add a rule for `/api/*` (for example
      60 requests per minute per IP) in addition to the app-level limits

## 8. Smoke test after each production deploy

1. `curl https://scot-free-cleaning.pages.dev/api/health` returns `{"ok":true}`
2. Book a slot on `/book`, then confirm it appears in `/admin` and that the alert email arrives
3. Cancel the test booking in `/admin`

## Rollback

- **Code:** go to **Workers & Pages → scot-free-cleaning → Deployments**, open the previous
  deployment and choose **Rollback**.
- **Data:** D1 Time Travel restores the database to any minute in the last 30 days:
  ```bash
  npx wrangler d1 time-travel info DB --env production
  npx wrangler d1 time-travel restore DB --env production --timestamp <ISO-8601>
  ```
  Migrations are forward-only, so restoring past a migration means redeploying the matching code.

## Custom domain (B7, optional)

Go to **Workers & Pages → scot-free-cleaning → Custom domains** and add the domain. Then:

- add it to the Turnstile widget hostnames and `TURNSTILE_ALLOWED_HOSTNAMES`
- add it to the Access application
- set `PUBLIC_SITE_URL` in CI (used for canonical URLs and the sitemap) and update `public/robots.txt`
