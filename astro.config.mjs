// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';

const site = process.env.PUBLIC_SITE_URL ?? 'https://scot-free-cleaning.pages.dev';
const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

// https://docs.astro.build/en/reference/configuration-reference/
export default defineConfig({
  site,
  output: 'static',
  // No markdown code blocks on this site; Shiki's inline styles would conflict with the CSP.
  markdown: { syntaxHighlight: false },
  // Cloudflare Pages serves `book.html` at `/book`; keep URLs without trailing slashes.
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [preact(), sitemap({ filter: (page) => !page.includes('/admin') })],
  security: {
    // Per-page <meta> CSP with hashes for Astro's own scripts/styles (ADR 0008).
    // Header-only directives (frame-ancestors, etc.) are set in public/_headers.
    csp: {
      algorithm: 'SHA-256',
      directives: [
        "default-src 'self'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self'",
        `frame-src ${TURNSTILE_ORIGIN}`,
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "worker-src 'none'",
        "manifest-src 'self'",
      ],
      scriptDirective: { resources: ["'self'", TURNSTILE_ORIGIN] },
      styleDirective: { resources: ["'self'"] },
    },
  },
  server: { port: 4321, host: '127.0.0.1' },
  vite: {
    server: {
      // In development the API runs under `wrangler pages dev` (npm run dev:api).
      proxy: { '/api': { target: 'http://127.0.0.1:8788', changeOrigin: true } },
    },
  },
});
