import js from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import { importX } from 'eslint-plugin-import-x';
import node from 'eslint-plugin-n';
import promise from 'eslint-plugin-promise';
import security from 'eslint-plugin-security';
import unicorn from 'eslint-plugin-unicorn';
import { defineConfig, globalIgnores } from 'eslint/config';
import { configs } from 'typescript-eslint';

const sourceFiles = ['**/*.{js,mjs,cjs,ts,tsx,mts,cts}'];
const typeScriptFiles = ['**/*.{ts,tsx,mts,cts}'];
const testFiles = [
  '**/*.{test,spec}.{ts,tsx,mts,cts}',
  '**/test/**/*.{ts,tsx,mts,cts}',
  '**/tests/**/*.{ts,tsx,mts,cts}'
];

export default defineConfig([
  // --------------------------------------------------
  // Global ignores
  // --------------------------------------------------

  globalIgnores(['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/target/**']),

  // --------------------------------------------------
  // ESLint core
  // --------------------------------------------------

  {
    files: sourceFiles,
    extends: [js.configs.recommended]
  },

  // --------------------------------------------------
  // TypeScript
  // --------------------------------------------------

  {
    files: typeScriptFiles,
    extends: [configs.recommended],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      // --------------------------------------------------
      // Variable declarations
      // --------------------------------------------------

      'no-var': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],

      // --------------------------------------------------
      // Unused variables
      // --------------------------------------------------

      'no-unused-vars': 'off',

      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true
        }
      ],

      // --------------------------------------------------
      // TypeScript safety
      // --------------------------------------------------

      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-inferrable-types': 'error',

      // --------------------------------------------------
      // Type imports
      // --------------------------------------------------

      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'separate-type-imports'
        }
      ],

      // --------------------------------------------------
      // JavaScript best practices
      // --------------------------------------------------

      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'object-shorthand': ['error', 'always'],
      'prefer-template': 'error',
      'no-unneeded-ternary': 'error',
      'no-useless-return': 'error',
      'no-constant-binary-expression': 'error',
      'no-promise-executor-return': 'error',
      'no-new-wrappers': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      radix: 'error',

      // Console — CLI tool may use console, so warn rather than error
      'no-console': 'warn',

      // Strict mode & class safety
      'constructor-super': 'error',
      'no-class-assign': 'error',
      'no-this-before-super': 'error',

      // Conditionals & loops
      'no-constant-condition': 'error',
      'no-case-declarations': 'error',
      'no-duplicate-case': 'error',
      'no-else-return': 'error',
      'no-fallthrough': 'error',
      'no-lone-blocks': 'error',
      'no-loop-func': 'error',
      'no-nested-ternary': 'error',
      'no-unreachable-loop': 'error',
      'no-unmodified-loop-condition': 'error',

      // Debugger
      'no-debugger': 'error',

      // Variable safety
      'no-delete-var': 'error',
      'no-dupe-keys': 'error',
      'no-redeclare': 'error',
      'no-undef-init': 'error',
      'no-use-before-define': 'error',

      // Assignment safety
      'no-import-assign': 'error',
      'no-param-reassign': 'error',
      'no-self-assign': 'error',
      'no-self-compare': 'error',

      // Function & constructor safety
      'no-async-promise-executor': 'error',
      'no-func-assign': 'error',
      'no-global-assign': 'error',
      'no-new-func': 'error',
      'no-new-object': 'error',
      'no-new-symbol': 'error',
      'no-script-url': 'error',
      'no-with': 'error',

      // Return & throw safety
      'no-return-assign': ['error', 'always'],
      'no-return-await': 'error',
      'no-useless-call': 'error',
      'no-useless-catch': 'error',
      'no-useless-concat': 'error',
      'no-useless-constructor': 'error',
      'no-useless-escape': 'error',
      'no-useless-rename': 'error',

      // Regex safety
      'no-control-regex': 'error',
      'no-empty-character-class': 'error',
      'no-regex-spaces': 'error',
      'require-unicode-regexp': 'error',

      // Number & comparison safety
      'no-compare-neg-zero': 'error',
      'no-extend-native': 'error',
      'no-extra-boolean-cast': 'error',
      'no-negated-condition': 'error',
      'no-negated-in-lhs': 'error',
      'no-extra-bind': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',

      // String & template safety
      'no-template-curly-in-string': 'error',
      'prefer-regex-literals': ['error', { disallowRedundantWrapping: true }],

      // Async & promise safety
      'prefer-promise-reject-errors': ['error', { allowEmptyReject: false }],
      'require-await': 'error',

      // Miscellaneous safety
      'no-empty-pattern': 'error',
      'no-ex-assign': 'error',
      'no-extra-semi': 'error',
      'no-iterator': 'error',
      'no-labels': 'error',
      'no-lonely-if': 'error',
      'no-multi-assign': 'error',
      'no-multi-spaces': 'error',
      'no-multi-str': 'error',
      'no-native-reassign': 'error',
      'no-nonoctal-decimal-escape': 'error',
      'no-octal': 'error',
      'no-octal-escape': 'error',
      'no-sequences': 'error',
      'no-sparse-arrays': 'error',
      'no-tabs': 'error',
      'no-unreachable': 'error',
      'no-unsafe-finally': 'error',
      'no-unsafe-negation': 'error',
      'no-unsafe-optional-chaining': 'error',
      'no-unused-expressions': 'off',
      'no-useless-computed-key': 'error',
      'no-warning-comments': ['warn', { terms: ['todo', 'fixme', 'xxx'], location: 'start' }],
      'prefer-exponentiation-operator': 'error',
      'prefer-object-spread': 'error',
      'prefer-rest-params': 'error',
      'prefer-spread': 'error',
      'symbol-description': 'error',
      yoda: ['error', 'never'],

      // Extra safety from removed sections
      'no-unused-labels': 'error',
      'no-caller': 'error',
      'require-atomic-updates': 'error',
      'preserve-caught-error': 'error',

      // --------------------------------------------------
      // Unicorn — project deliberately uses `null` (not `undefined`)
      // for typed absences; short aliases mirror nodemon names.
      // --------------------------------------------------

      'unicorn/no-null': 'off',
      'unicorn/consistent-boolean-name': 'off',
      'unicorn/prefer-default-parameter': 'off'
    }
  },

  // --------------------------------------------------
  // Type-aware TypeScript linting
  // --------------------------------------------------

  {
    files: ['**/src/**/*.{ts,tsx,mts,cts}'],
    extends: [configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      '@typescript-eslint/consistent-type-exports': 'error'
    }
  },

  // --------------------------------------------------
  // Import validation
  // --------------------------------------------------

  {
    files: sourceFiles,
    extends: [importX.flatConfigs.recommended, importX.flatConfigs.typescript],
    settings: {
      'import-x/resolver': {
        typescript: true,
        node: true
      }
    }
  },

  // --------------------------------------------------
  // Node.js best practices
  // --------------------------------------------------

  {
    ...node.configs['flat/recommended'],
    files: sourceFiles,
    rules: {
      'n/no-process-exit': 'warn'
    }
  },

  // --------------------------------------------------
  // Promise handling
  // --------------------------------------------------

  {
    ...promise.configs['flat/recommended'],
    files: sourceFiles
  },

  // --------------------------------------------------
  // Security checks
  // --------------------------------------------------

  {
    ...security.configs.recommended,
    files: sourceFiles,
    rules: {
      // File watcher/config parser: dynamic file access and object keys are intentional.
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-non-literal-regexp': 'off',
      'security/detect-unsafe-regex': 'off'
    }
  },

  // --------------------------------------------------
  // Modern JavaScript / TypeScript practices
  // --------------------------------------------------

  {
    files: sourceFiles,
    plugins: {
      unicorn
    },
    rules: {
      // Project deliberately uses `null` (not `undefined`) for typed absences;
      // short aliases mirror nodemon names.
      'unicorn/no-null': 'off',
      'unicorn/consistent-boolean-name': 'off',
      'unicorn/prefer-default-parameter': 'off',
      'unicorn/name-replacements': 'off',
      'unicorn/prefer-spread': 'off'
    }
  },

  // --------------------------------------------------
  // Vitest testing rules
  // --------------------------------------------------

  {
    files: testFiles,
    ...vitest.configs.recommended,
    rules: {
      ...vitest.configs.recommended.rules,
      'vitest/max-nested-describe': ['error', { max: 3 }],
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Tests intentionally use these patterns
      'no-void': 'off',
      'no-shadow': 'off',
      'require-unicode-regexp': 'off',
      'no-warning-comments': 'off',
      'no-unused-expressions': 'off'
    }
  }
]);
