<!-- markdownlint-disable -->

---

'nodeloop': minor
'@nodeloop/native-linux-x64-gnu': minor
'@nodeloop/native-linux-arm64-gnu': minor
'@nodeloop/native-darwin-x64': minor
'@nodeloop/native-darwin-arm64': minor
'@nodeloop/native-win32-x64-msvc': minor
'@nodeloop/native-win32-arm64-msvc': minor
---

TypeScript + Rust migration: `nodeloop` with the nodeloop-native Rust core behind an N-API bridge. The legacy `nodeloop` package keeps version 1.0.0 untouched — this changeset only PROPOSES the new package versions; applying it (npm version/publish) still requires maintainer approval.
