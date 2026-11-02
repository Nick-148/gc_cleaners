---
name: pre-commit-review
description: Mandatory code review and verification before any git commit in this repo. Use whenever you are about to commit, open an MR, or say work is "done".
---

# Pre-commit review

Nothing is committed without completing this checklist. Spec rule: "do a code review before committing".

## 1. Verify mechanically

```bash
npm run verify            # format:check, lint, typecheck, unit + integration tests, build
npm audit --omit=dev      # must report 0 vulnerabilities
```

If you touched UI or a user flow, also run `npm run test:e2e`.

If you touched `.astro` copy, scan the build for text glued to inline tags. Prettier's Astro
formatter can drop the space after `</strong>` or `</a>`. Fix any hit with an explicit `{' '}`:

```bash
grep -ohE '</(strong|a|em)>[A-Za-z(][^<]{0,25}' dist/*.html | sort -u
```

## 2. Review the diff

Run `git diff --staged` (or `git diff` before staging) and read **every hunk**. If the
`/code-review` skill is available, run it on the diff as well. Check each of these:

**Correctness**

- [ ] Does it do what PLAN.md/the spec says? Are edge cases handled (empty, max size, DST days, past dates, full slots)?
- [ ] Does each new branch or route have tests? Do the tests assert behavior rather than implementation?

**Security** (see AGENTS.md → Coding standards)

- [ ] All input validated with a shared Zod schema at the boundary
- [ ] SQL only in repositories, parameters via `.bind()`
- [ ] Mutating routes: same-origin + Turnstile (public) or Access JWT (admin)
- [ ] No PII in logs; user content HTML-escaped in emails
- [ ] No secrets, tokens or real personal data committed (`git diff --staged | grep -iE "secret|token|api[_-]?key|password"`)
- [ ] Uploads validated by magic bytes; never served from a public URL

**Accessibility and UX**

- [ ] Labels on inputs, errors linked with `aria-describedby`, focus management after submit
- [ ] No inline `style=""` or inline handlers (CSP)
- [ ] Copy never implies Gordon College affiliation or guarantees passing inspection

**Maintainability**

- [ ] Business constants only in `src/config/site.ts`; Gordon facts only in `src/content/gordon-policy.ts` with source + `verifiedOn`
- [ ] Matches surrounding style; no dead code or leftover debug logging
- [ ] Docs updated in the same change: PLAN.md status, PROGRESS.md entry, ADR if a decision was made

## 3. Fix, then re-verify

Fix every finding, then rerun step 1. Don't commit with known failures. If something truly
can't be fixed now, record it in PLAN.md first.

## 4. Commit

Conventional Commit message. Explain _why_ in the body, list notable decisions or ADRs, and
mention that the review was done. Work on a short-lived branch, push it to `origin` (GitHub) and open a pull request. `main` stays deployable.
