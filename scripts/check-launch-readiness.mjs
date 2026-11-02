// Fails (exit 1) while any launch blocker from PLAN.md is still stubbed. CI runs this before
// every production deploy, so placeholders and test keys can't reach production by accident.
// Usage: PUBLIC_TURNSTILE_SITE_KEY=... node scripts/check-launch-readiness.mjs
import { readFileSync } from 'node:fs';

const problems = [];

const siteConfig = readFileSync('src/config/site.ts', 'utf8');
if (/isPlaceholder:\s*true/.test(siteConfig)) {
  problems.push(
    'B1: contact details / Venmo handle are still placeholders (src/config/site.ts → isPlaceholder).',
  );
}

const wrangler = readFileSync('wrangler.toml', 'utf8');
const production = wrangler.slice(wrangler.indexOf('# ---------- production ----------'));
if (!production.startsWith('# ---------- production')) {
  problems.push('wrangler.toml: production section marker not found; update this script.');
} else {
  if (/database_id\s*=\s*"0{8}-0{4}-0{4}-0{4}-0{12}"/.test(production)) {
    problems.push('B3: production D1 database_id is a placeholder (wrangler.toml).');
  }
  if (/ACCESS_TEAM_DOMAIN\s*=\s*""/.test(production) || /ACCESS_AUD\s*=\s*""/.test(production)) {
    problems.push(
      'B5: Cloudflare Access is not configured for production (ACCESS_TEAM_DOMAIN / ACCESS_AUD).',
    );
  }
}

const siteKey = process.env.PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? '';
if (siteKey === '' || /^[123]x0{20}/.test(siteKey)) {
  problems.push('B4: PUBLIC_TURNSTILE_SITE_KEY is missing or a Cloudflare test key.');
}

if (problems.length > 0) {
  console.error(
    'Launch readiness check FAILED. Clear these blockers (see PLAN.md and docs/deploy.md):',
  );
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('Launch readiness check passed.');
