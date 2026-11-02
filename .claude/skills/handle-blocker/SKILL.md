---
name: handle-blocker
description: What to do when work is blocked by an external dependency (credentials, accounts, owner decisions, third-party services). Document it, stub it behind an interface, and keep going.
---

# Handling a blocker (ADR 0012)

Never stall. Follow these steps in order.

1. **Confirm it's external.** If you can solve it in the repo, it isn't a blocker.
2. **Document it** in `PLAN.md` → _Blockers_. Add a row with the next `B#`, what is missing,
   the stub in place, who can unblock it, and today's date.
3. **Put it behind an interface.**
   - Server integrations: define an interface in `src/server/services/<name>.ts`, a real
     implementation, and a stub. Select between them in `src/server/env.ts` based on config.
   - Config values: add them to `src/config/site.ts` with an obvious placeholder, and set
     `isPlaceholder: true` if they must be replaced before launch.
   - **Stubs must be safe.** In development they log instead of acting. In production they _fail
     closed_ (e.g. 503) when the missing piece is security-relevant (Turnstile, Access).
4. **Test the stub path**, so tests prove the system behaves when the dependency is missing.
5. **Log it** in `PROGRESS.md` and move on to the next unblocked task.
6. **When it's unblocked:** wire up the real implementation, remove the row from _Blockers_,
   add a PROGRESS entry, and update `docs/deploy.md` if setup steps changed.

Current blockers B1–B7 are listed in PLAN.md.
