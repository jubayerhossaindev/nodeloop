# Security policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.x     | ✅        |

## Reporting a vulnerability

Open a private security advisory on the GitHub repository — do **not** open a public issue.

nodeloop is a local development tool: it spawns the process you point it at, forwards stdin, and reads config files from the working directory. It never opens network sockets or evaluates remote content.

## Scope

- Local file watching and process supervision
- Config file parsing (JSON, TOML, YAML, INI, .env, JavaScript, TypeScript)
- Native Rust watcher core (NAPI)

Out of scope: remote code execution via network, supply-chain attacks on the npm/Rust registries themselves (reported to those platforms instead).
