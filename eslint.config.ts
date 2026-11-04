import tseslint from 'typescript-eslint';

/**
 * ESLint flat config for the nodeloop monorepo ROOT — covers the
 * root-level TypeScript (tooling scripts, examples, demo, benchmarks).
 * The `nodeloop` workspace lints itself with its own config
 * (`packages/nodeloop/eslint.config.ts`) via `npm run lint:ts`.
 */
export default tseslint.config(
  {
    ignores: [
      'packages/**',
      '**/node_modules/**',
      '**/dist/**',
      '**/target/**',
      'coverage/**',
      '**/.tmp/**',
      '**/.vitest/**',
      '**/*.node',
      '**/.moon/cache/**',
      '**/.moon/state/**',
      '**/.husky/_/**'
    ]
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['**/*.ts'],
    languageOptions: {
      ...config.languageOptions,
      parserOptions: {
        ...config.parserOptions,
        tsconfigRootDir: import.meta.dirname
      }
    }
  })),
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-constant-condition': 'error',
      'no-fallthrough': 'error',
      'no-unreachable': 'error'
    }
  }
);
