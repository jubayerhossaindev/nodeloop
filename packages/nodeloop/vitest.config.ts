import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /* ── Test file discovery ───────────────────────────────────────── */
    include: ['test/**/*.test.ts'],
    exclude: [
      'node_modules',
      'dist',
      '.git',
      'coverage',
      '**/*.d.ts',
      '**/fixtures/**',
      '**/coverage/**'
    ],

    /* ── Environment ───────────────────────────────────────────────── */
    environment: 'node',
    globals: false,

    /* ── Isolation & parallelism ───────────────────────────────────── */
    // sequential files: the native loader tests temporarily rename the
    // staged addon and patch Module._resolveFilename — isolation required.
    fileParallelism: false,
    isolate: true,
    pool: 'forks',
    maxConcurrency: 5,

    /* ── Timeouts ──────────────────────────────────────────────────── */
    testTimeout: 20_000,
    hookTimeout: 20_000,
    teardownTimeout: 10_000,

    /* ── Mock hygiene ──────────────────────────────────────────────── */
    clearMocks: true,

    /* ── Output & logging ──────────────────────────────────────────── */
    hideSkippedTests: false,
    includeTaskLocation: false,
    printConsoleTrace: true,
    disableConsoleIntercept: false,
    dangerouslyIgnoreUnhandledErrors: false,

    /* ── Retry / bail ──────────────────────────────────────────────── */
    retry: 0,
    bail: 0,

    /* ── Sequencing ────────────────────────────────────────────────── */
    sequence: {
      shuffle: false,
      concurrent: false,
      hooks: 'list',
      setupFiles: 'list'
    },

    /* ── Slow test detection ───────────────────────────────────────── */
    slowTestThreshold: 300,

    /* ── Snapshot ──────────────────────────────────────────────────── */
    update: false,

    /* ── Expect ────────────────────────────────────────────────────── */
    expect: {
      requireAssertions: false,
      poll: {
        timeout: 5000,
        interval: 100
      }
    },

    /* ── Chai ──────────────────────────────────────────────────────── */
    chaiConfig: {
      includeStack: false,
      showDiff: true,
      truncateThreshold: 40
    },

    /* ── Type checking ─────────────────────────────────────────────── */
    typecheck: {
      checker: 'tsc',
      include: ['**/*.{test,spec}-d.?(c|m)[jt]s?(x)'],
      exclude: ['node_modules', 'dist', '.git', 'coverage']
    },

    /* ── Reporters ─────────────────────────────────────────────────── */
    reporters: ['default'],

    /* ── Coverage ──────────────────────────────────────────────────── */
    coverage: {
      provider: 'v8',
      enabled: false,
      clean: true,
      cleanOnRerun: true,
      reportsDirectory: './coverage',
      reportOnFailure: false,
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/types.ts',
        '**/*.d.ts',
        'coverage/',
        'dist/',
        '/node_modules/',
        '/[.]',
        'packages//test?(s)/',
        'cypress/',
        'test?(s)/',
        '**/{.,-}{test,spec,bench,benchmark}.*',
        '**/{.,-}{.,-}config.*',
        '**/vitest.{workspace,projects}.[jt]s?(on)'
      ],
      thresholds: {
        perFile: true,
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100
      },
      reporter: ['text', 'json-summary', 'lcov', 'json']
    }
  }
});
