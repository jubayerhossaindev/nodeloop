// lint-staged.config.js — Modern lint-staged configuration for nodeloop monorepo (ESM)
// Runs formatters/linters on staged files before each commit.
// https://github.com/lint-staged/lint-staged

export default {
  // --------------------------------------------------
  // TypeScript / TypeScript React
  // --------------------------------------------------
  '*.{ts,tsx}': ['eslint --fix', 'prettier --write'],

  // --------------------------------------------------
  // JavaScript / JSX
  // --------------------------------------------------
  '*.{js,jsx}': ['eslint --fix', 'prettier --write'],

  // --------------------------------------------------
  // Markdown
  // --------------------------------------------------
  '*.md': ['markdownlint-cli2 --config .markdownlint.yaml', 'prettier --write'],

  // --------------------------------------------------
  // JSON / YAML / YML
  // --------------------------------------------------
  '*.{json,yaml,yml}': ['prettier --write'],

  // --------------------------------------------------
  // TOML (Taplo formatter)
  // --------------------------------------------------
  '*.toml': ['taplo format'],

  // --------------------------------------------------
  // Rust (Clippy linter + rustfmt formatter)
  // --------------------------------------------------
  '*.rs': ['sh -c "cargo clippy --all-targets -- -D warnings"', 'rustfmt'],

  // --------------------------------------------------
  // Shell scripts
  // --------------------------------------------------
  '*.sh': 'shellcheck --format=json',

  // --------------------------------------------------
  // Config dotfiles (ESLint, Prettier, Commitlint, Stylelint)
  // --------------------------------------------------
  '.{eslintrc*,prettierrc*,commitlintrc*,stylelintrc*}': 'prettier --write',

  // --------------------------------------------------
  // GitHub / Husky workflow YAML
  // --------------------------------------------------
  '.{github,husky}/**/*.{yml,yaml}': 'prettier --write'
};
