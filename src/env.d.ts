interface ImportMetaEnv {
  /** Cloudflare Turnstile site key (public). Defaults to Cloudflare's always-pass test key. */
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
  /** Canonical site origin, e.g. https://scot-free-cleaning.pages.dev */
  readonly PUBLIC_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
