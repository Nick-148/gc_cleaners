// Cloudflare Pages Functions entry for every /api/* request. All logic lives in src/server (ADR 0002).
import type { Bindings } from '../../src/server/env';
import { createApp } from '../../src/server/app';

const app = createApp();

export const onRequest: PagesFunction<Bindings> = (context) =>
  app.fetch(context.request, context.env, {
    waitUntil: (promise) => {
      context.waitUntil(promise);
    },
    passThroughOnException: () => {
      context.passThroughOnException();
    },
    props: {},
  });
