# 0012. When blocked: document, stub behind an interface, move on

- Status: Accepted
- Date: 2026-11-02

## Context

Many launch dependencies are outside the codebase: Cloudflare account resources, Turnstile keys,
the Access application, an email domain, the GitLab remote, and real contact details.
Waiting on them would stall development.

## Decision

When work is blocked by something outside the repository:

1. Add it to `PLAN.md` → _Blockers_ with: what, why it blocks, who can unblock, date added.
2. Put the dependency behind an interface (`src/server/services/*` or config) and ship a stub
   that is **safe by default**: it logs instead of sending, uses a test key in development, or
   fails closed in production.
3. Write a `PROGRESS.md` entry, then continue with unblocked work.
4. When the blocker clears, replace the stub, remove the entry from _Blockers_, and log it.

Procedure: `.claude/skills/handle-blocker/SKILL.md`.

## Consequences

Development never stops for external setup. Launch readiness is visible in one list.
