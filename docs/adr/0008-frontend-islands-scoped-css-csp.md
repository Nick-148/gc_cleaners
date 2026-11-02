# 0008. Frontend: Preact islands, scoped CSS, strict CSP

- Status: Accepted
- Date: 2026-11-02

## Context

Most of the site is static content. The booking calendar, the forms (validation, uploads,
Turnstile) and the admin dashboard need client-side interactivity. We want a small JavaScript
footprint, few dependencies, and a strict Content Security Policy.

## Decision

- **Preact 11 islands** via `@astrojs/preact` (~4 KB runtime). Islands are hydrated with
  `client:load` or `client:visible`. Static content stays as zero-JS Astro components.
- **No CSS framework.** Design tokens are CSS custom properties in `src/styles/global.css`,
  with Astro-scoped `<style>` blocks per component and a small set of global utility classes.
  This avoids a build dependency and keeps the CSS legible.
- **CSP** via Astro's built-in `security.csp`, which emits a per-page `<meta>` policy with hashes
  for Astro's own scripts and styles. Allowed external origin: `https://challenges.cloudflare.com`
  (Turnstile script + frame). Header-only directives (`frame-ancestors`) and the other security
  headers live in `public/_headers`.
- Because of the CSP, components must not use inline `style` attributes or inline event-handler
  attributes. Use classes and `addEventListener`/JSX handlers.
- Brand: our own palette (deep teal + warm cream + amber accent). We deliberately avoid Gordon
  College's colors and marks.

## Consequences

- Every new external resource requires a CSP change (and an ADR if it's a new third party).
- Shared Zod schemas are bundled into islands (~15 KB gz). That's acceptable for consistent validation.
