# 0009. Dependency and supply-chain policy

- Status: Accepted
- Date: 2026-11-02

## Context

Supply-chain attacks usually target freshly published versions. The project must be reproducible.

## Decision

- **Exact pins** (`.npmrc save-exact=true`) and a committed `package-lock.json`. CI uses `npm ci`.
- **Release-age rule:** a new or upgraded package must have a version published **at least 7 days ago**.
- **Install scripts** are blocked by default (npm 11 `allowScripts`). Only `esbuild`, `workerd`
  and `fsevents` are approved, at exact versions, because they install native binaries.
- **Minimal runtime dependencies:** astro, @astrojs/preact, @astrojs/sitemap, preact, hono,
  zod, jose. Adding one requires a justification in the commit message, and a new ADR if it's significant.
- **Version constraints found on 2026-11-02:**
  - TypeScript **6.0.x**, not 7.x: `typescript-eslint` and `@astrojs/check` don't support 7 yet.
  - Vitest **4.1.x**: `@cloudflare/vitest-plugin` (successor to the deprecated
    `@cloudflare/vitest-pool-workers`) supports 4.1+.
  - `eslint-plugin-jsx-a11y-x` instead of `eslint-plugin-jsx-a11y`, which doesn't support ESLint 10.
- **Audit policy:** `npm audit --omit=dev` must be clean (enforced in CI). Dev-only advisories
  are reviewed and either fixed or accepted below.

## Accepted dev-only advisories

| Advisory                                                  | Package path          | Why accepted                                                                                                                               | Revisit                          |
| --------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| GHSA-g3hv-75wg-m249 (minimatch ReDoS-style DoS, moderate) | eslint → minimatch@10 | Only reachable through glob patterns we write ourselves in lint config; not shipped. Fix needs minimatch 11, and ESLint 10 still pins ^10. | When ESLint ships minimatch ≥ 11 |

## Consequences

- Upgrades are deliberate. Run `npm outdated` monthly and log upgrades in `PROGRESS.md`.
