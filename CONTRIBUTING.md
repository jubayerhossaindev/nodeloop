# Contributing to nodeloop

Thanks for your interest in contributing! Please read this guide before submitting changes.

## How to contribute

1. Fork the repo and create a branch from `main`.
2. Install dependencies: `npm install`.
3. Make your changes.
4. Run the full check suite: `make check` (runs typecheck, lint, and Rust fmt).
5. Run tests: `npm test`.
6. Commit using Conventional Commits: `feat(scope): description`.
7. Open a pull request against `main`.

## Commit messages

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/) and are enforced by commitlint:

````text
type(scope): subject
```text

Allowed types: `build, ci, docs, feat, fix, perf, refactor, revert, style, test, chore`.

## Code style

- TypeScript: Prettier (printWidth 100, singleQuote, no trailing comma) + ESLint.
- Rust: rustfmt (style_edition 2024, max_width 100) + Clippy (`-D warnings`).
- Run `npm run lint:ts` and `npm run lint:rust` before pushing.

## Pull requests

- Link to the related issue.
- Keep PRs small and focused.
- All status checks must pass before merge.

## License

By contributing, you agree your contributions are licensed under the MIT License.
````
