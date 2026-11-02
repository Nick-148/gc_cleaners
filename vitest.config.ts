import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Two projects (ADR 0010):
//  - unit: pure logic in Node
//  - integration: the Hono API inside workerd with Miniflare D1 + R2
export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations');
  return {
    test: {
      projects: [
        {
          test: {
            name: 'unit',
            include: ['tests/unit/**/*.test.ts'],
            environment: 'node',
          },
        },
        {
          plugins: [
            cloudflareTest({
              miniflare: {
                compatibilityDate: '2026-10-01',
                d1Databases: ['DB'],
                r2Buckets: ['UPLOADS'],
                bindings: {
                  ENVIRONMENT: 'test',
                  TEST_MIGRATIONS: migrations,
                },
              },
            }),
          ],
          test: {
            name: 'integration',
            include: ['tests/integration/**/*.test.ts'],
            setupFiles: ['./tests/integration/setup.ts'],
          },
        },
      ],
    },
  };
});
