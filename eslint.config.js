// @ts-check
import js from '@eslint/js';
import astro from 'eslint-plugin-astro';
import jsxA11y from 'eslint-plugin-jsx-a11y-x';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Rules shared by the Preact (jsx-a11y-x) and Astro (astro/jsx-a11y) accessibility plugins.
/** @type {(prefix: string) => import('eslint').Linter.RulesRecord} */
const a11yOverrides = (prefix) => ({
  // Explicit role="list" is intentional: Safari drops list semantics when list-style is none.
  [`${prefix}/no-redundant-roles`]: ['error', { ul: ['list'], ol: ['list'] }],
  // Scrollable regions must be keyboard-focusable (axe: scrollable-region-focusable).
  [`${prefix}/no-noninteractive-tabindex`]: ['error', { roles: ['region', 'tabpanel'] }],
});

export default defineConfig(
  {
    ignores: [
      'dist/',
      '.astro/',
      '.wrangler/',
      'coverage/',
      'playwright-report/',
      'test-results/',
      'node_modules/',
    ],
  },
  js.configs.recommended,

  // Type-aware TypeScript rules for all TS/TSX, checked against the right tsconfig per area.
  {
    files: ['**/*.{ts,tsx}'],
    // <script> blocks inside .astro files are linted as virtual files with no TS project.
    ignores: ['**/*.astro/*.ts'],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.worker.json', './tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/consistent-type-imports': 'error',
      // For strings we deliberately treat '' as "not set" (trimmed config values, blank inputs).
      '@typescript-eslint/prefer-nullish-coalescing': [
        'error',
        { ignorePrimitives: { string: true } },
      ],
      // Hono handlers and Preact event props legitimately pass async functions.
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      'no-console': 'off',
    },
  },

  // Tests may use non-null assertions and looser typing of fixtures.
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      // `(await res.json()) as T` is the clearest way to type a response body in a test.
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unnecessary-type-parameters': 'off',
    },
  },

  // Browser code must not log (PII risk) and must be accessible.
  {
    files: ['src/components/islands/**/*.tsx'],
    ...jsxA11y.configs.recommended,
    languageOptions: { globals: globals.browser },
    rules: {
      ...jsxA11y.configs.recommended.rules,
      ...a11yOverrides('jsx-a11y-x'),
      'no-console': 'error',
      // Labels wrap their input or point at it with htmlFor (Preact sets it as a DOM property).
      'jsx-a11y-x/label-has-associated-control': [
        'error',
        { assert: 'either', controlComponents: ['input', 'select', 'textarea'] },
      ],
    },
  },

  // Astro components: recommended rules + accessibility.
  ...astro.configs['flat/recommended'],
  ...astro.configs['flat/jsx-a11y-recommended'],
  { files: ['**/*.astro'], rules: a11yOverrides('astro/jsx-a11y') },

  // Plain JS config files (Node).
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: { globals: globals.node },
  },
);
