# @nodeloop/native — platform binaries

Prebuilt N-API addons for the nodeloop Rust core (`crates/nodeloop-native`).
`nodeloop` declares every package here as an `optionalDependency`, so npm
installs exactly the one matching the user's platform and the loader
(`src/native/loader.ts`) finds it without any configuration.

## Packages

| Package                             | Platform            | Toolchain |
| ----------------------------------- | ------------------- | --------- |
| `@nodeloop/native-win32-x64-msvc`   | Windows x64         | MSVC      |
| `@nodeloop/native-win32-arm64-msvc` | Windows ARM64       | MSVC      |
| `@nodeloop/native-linux-x64-gnu`    | Linux x64           | glibc     |
| `@nodeloop/native-linux-arm64-gnu`  | Linux ARM64         | glibc     |
| `@nodeloop/native-darwin-x64`       | macOS Intel         | Xcode     |
| `@nodeloop/native-darwin-arm64`     | macOS Apple Silicon | Xcode     |

## Verification status (honest, per the migration spec)

Verified by a real build + test run on this machine:

- **linux-x64-gnu** — ✅ `cargo build --release` + full contract/lifecycle/e2e
  test suites against the produced `nodeloop_native.node` (see
  `maintainers/MIGRATION_REPORT.md`).

Not verifiable from this sandbox (no cross toolchains) — the packages ship as
**build-ready scaffolding** and MUST NOT be claimed as tested until the CI
native matrix builds them on real runners:

- win32-x64-msvc, win32-arm64-msvc, linux-arm64-gnu, darwin-x64, darwin-arm64 — ⏳ awaiting the CI matrix (`.github/workflows/native.yml`).

## Build

From the repository root:

```sh
npm run build:native                 # host platform, release
NODELOOP_NATIVE_PROFILE=debug npm run build:native
```

A release produces `target/release/nodeloop_native.node`, which is copied into
the matching platform package by `tooling/scripts/package-native.sh` (CI job).
