# nodeloop

## 1.0.0

Initial TypeScript release of nodeloop — the full CLI port with the Rust
watcher/supervisor core behind an N-API bridge:

- 14 CLI options, 21 config keys, 10 config formats — 1:1 with v1 semantics
- Rust core (`crates/nodeloop-core`): inotify + polling watcher, debounce
  with maxWait burst cap, process-tree supervisor
- Native bridge (`crates/nodeloop-native`) — forwarding only, no logic
- Vitest suite with per-file 100% statement/branch/function/line coverage
