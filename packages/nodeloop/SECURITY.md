# Security policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.x     | ✅        |

## Reporting a vulnerability

Open a private security advisory on the GitHub repository — do **not** open a
public issue. nodeloop is a local development tool: it spawns the process you
point it at, forwards stdin, and reads config files from the working
directory. It never opens network sockets or evaluates remote content.
