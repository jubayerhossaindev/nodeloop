.DEFAULT_GOAL := help
.DELETE_ON_ERROR:

.PHONY: help typecheck lint test test-rust fmt-rust check test-all clean

help:
	@echo "nodeloop — professional Rust + TypeScript monorepo"
	@echo ""
	@echo "Targets:"
	@echo "  typecheck   TypeScript typecheck"
	@echo "  lint        ESLint (TS) + clippy (Rust)"
	@echo "  test        TypeScript tests"
	@echo "  test-rust   Rust tests"
	@echo "  test-all    TypeScript + Rust tests"
	@echo "  fmt-rust    cargo fmt --check"
	@echo "  check       typecheck + lint + fmt-rust"
	@echo "  clean       remove dist/target/coverage"

typecheck:
	npm run typecheck

lint:
	npm run lint

test:
	npm test

test-rust:
	npm run test:rust

fmt-rust:
	npm run fmt:rust

check: typecheck lint fmt-rust

test-all: test test-rust

clean:
	rm -rf dist target coverage .vitest vitest-temp .moon/cache .moon/state
