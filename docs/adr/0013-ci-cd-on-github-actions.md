# 0013. CI/CD on GitHub Actions

- Status: Accepted
- Date: 2026-11-02

## Context

The spec planned for GitLab, so the first pipeline was `.gitlab-ci.yml`. The owner then provided a
GitHub repository (`github.com/Nick-148/gc_cleaners`, public), where GitLab CI never runs.
Without a working pipeline, nothing enforces `npm run verify` or e2e on push, and deploys are manual.

## Decision

- Replace `.gitlab-ci.yml` with `.github/workflows/ci.yml`, keeping the same shape:
  **verify → e2e → deploy**.
  - `verify` runs format, lint, typecheck, `npm audit --omit=dev`, unit + integration tests and the build.
  - `e2e` runs Playwright + axe inside `mcr.microsoft.com/playwright`, with the tag matched to
    `@playwright/test`. The report is uploaded as an artifact.
  - `deploy-preview` deploys non-`main` branches to Pages preview, using the preview D1/R2.
  - `deploy-production` deploys `main` through the `production` **environment**, after
    `npm run check:launch`. Adding _required reviewers_ to that environment gives the same manual
    approval step the GitLab pipeline had.
- Deploy jobs are skipped until the repository **variable** `CLOUDFLARE_ACCOUNT_ID` exists. A
  variable is used rather than the secret, because job-level `if:` can't read secrets. The API token
  stays a secret.
- **Supply chain** (ADR 0009 applied to CI):
  - every third-party action is pinned to a full commit SHA from a release at least 7 days old,
    with the version in a comment
  - the workflow token is read-only (`permissions: contents: read`)
  - `checkout` runs with `persist-credentials: false`
- Triggers: `push` on every branch, plus `workflow_dispatch`. Pull requests show the push run for
  their head commit, which avoids duplicate runs. In-progress runs on the same branch are cancelled,
  except on `main`, where a run may be deploying.

## Consequences

- Every push gets the full quality gate. Branch protection on `main` can require the `Verify` and
  `End-to-end` checks (docs/deploy.md §6).
- Pinned SHAs need deliberate updates. Bump them along with the monthly dependency review (ADR 0009).
- Pull requests from forks don't run CI under this trigger. That's acceptable for a single-owner repo;
  revisit if outside contributions start.
