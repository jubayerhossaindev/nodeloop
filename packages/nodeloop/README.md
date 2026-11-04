<div align="center">
  <a href="https://github.com/jubayerhossaindev/nodeloop">
    <img
      src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=700&size=48&duration=2800&pause=900&color=42D9F3&center=true&vCenter=true&width=520&lines=nodeloop"
      alt="nodeloop"
    />
  </a>

  <h1>nodeloop 🐟</h1>

  <p>
    <strong>Restart your Node.js app automatically when your files change.</strong>
    <br />
    A focused, nodemon-style runner with a TypeScript CLI and a Rust-powered native core.
  </p>

  <p>
    <a href="https://www.npmjs.com/package/nodeloop">
      <img src="https://img.shields.io/npm/v/nodeloop?label=npm&logo=npm&logoColor=white&color=42D9F3&style=for-the-badge" alt="npm version" />
    </a>
    <a href="https://nodejs.org">
      <img src="https://img.shields.io/badge/Node.js-%3E%3D24.22.2-43853D?logo=nodedotjs&logoColor=white&style=for-the-badge" alt="Node.js 24.22.2 or later" />
    </a>
    <a href="https://github.com/jubayerhossaindev/nodeloop/actions/workflows/ci.yml">
      <img src="https://img.shields.io/github/actions/workflow/status/jubayerhossaindev/nodeloop/ci.yml?branch=main&label=CI&logo=githubactions&logoColor=white&style=for-the-badge" alt="CI workflow status" />
    </a>
    <a href="https://github.com/jubayerhossaindev/nodeloop/actions/workflows/native.yml">
      <img src="https://img.shields.io/github/actions/workflow/status/jubayerhossaindev/nodeloop/native.yml?branch=main&label=Native%20build&logo=rust&logoColor=white&style=for-the-badge" alt="Native build workflow status" />
    </a>
    <a href="LICENSE">
      <img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg?style=for-the-badge" alt="Apache 2.0 license" />
    </a>
  </p>

  <p>
    ⚡ Smart restarts&nbsp; · &nbsp;🌳 Process-tree control&nbsp; · &nbsp;🎨 Colorful terminal UI
    <br />
    ⚙️ Flexible configuration&nbsp; · &nbsp;🦀 Rust native core&nbsp; · &nbsp;💚 Developer-focused DX
  </p>
</div>

---

## ✨ What is nodeloop?

**nodeloop** watches your project files and restarts your application when something changes. It keeps running when your app exits unexpectedly, then starts it again when you make the next change.

```text
[nodeloop]  ● watching: .
[nodeloop]  ▶ starting: node server.js

Server listening on :3000

[nodeloop]  ↻ restarting after a file change...
[nodeloop]  ▶ starting: node server.js

Server listening on :3000
```

The workflow stays simple:

**Edit → Save → Restart → Keep building.**

## 🚀 Highlights

|     | Capability                 | What it means                                                                             |
| :-: | -------------------------- | ----------------------------------------------------------------------------------------- |
| 🔄  | **Automatic restarts**     | Restart your app when watched files are added, changed, renamed or deleted.               |
| 🧯  | **Crash recovery**         | Keep watching after a failed run and restart when you fix the code.                       |
| 🌳  | **Process-tree shutdown**  | Stop the supervised process and its child processes when restarting or exiting.           |
| 🎯  | **Precise watch controls** | Choose extensions, ignored paths and directories to watch.                                |
| ⏱️  | **Smart restart timing**   | Debounce rapid file changes and optionally cap long change bursts with `maxWait`.         |
| 🧰  | **Flexible execution**     | Run Node scripts, TypeScript runners or another command with `--exec`.                    |
| ⚙️  | **Multi-format config**    | Configure nodeloop with JSON, TOML, YAML, JavaScript, TypeScript or package.json.         |
| 🎨  | **Adaptive terminal UI**   | Semantic icons and colors with truecolor, 256-color, 16-color and plain-output fallbacks. |
| ⌨️  | **Manual restart**         | Type `rs` and press Enter in an interactive terminal.                                     |

## 📦 Requirements

- **Node.js:** `>=24.22.2`
- **For source builds:** a Rust toolchain compatible with the workspace requirement in `Cargo.toml`
- **Platform:** native package for your operating system and architecture

## ⚠️ Installation status

The native loader already supports platform packages such as `@nodeloop/native-linux-x64-gnu` and a locally built workspace binary. However, the current `packages/nodeloop/package.json` does not yet declare the platform packages under `optionalDependencies`.

That means a plain registry install cannot yet be described as a complete, automatic native installation. Until the platform packages are published and connected to the main package, build from source using the Development section below.

### Registry usage

After the main package and matching native platform packages are published and wired together, the intended user workflow is:

```bash
# Install globally
npm install -g nodeloop

# Start your app with automatic restarts
nodeloop app.js

# Or use it without a global installation
npx nodeloop app.js
```

## ⚡ Quick start

Once the CLI and matching native addon are available, start watching a script:

```bash
nodeloop server.js
```

Pass arguments to your application:

```bash
nodeloop server.js --port 3000
```

Run a different command:

```bash
nodeloop --exec "npm run dev"
nodeloop --exec "tsx src/main.ts"
```

Save a watched file and nodeloop restarts the process. Your application's arguments are passed through to the child process.

## 🧭 CLI reference

```bash
nodeloop <script> [args...]       # run a script and restart on changes
nodeloop                          # resolve package.json main, index.js, then server.js
nodeloop -e js,json app.js        # choose watched extensions
nodeloop -i uploads app.js        # ignore additional paths
nodeloop -w packages/api app.js   # watch only selected path prefixes
nodeloop -d 500 app.js            # set restart debounce to 500 ms
nodeloop -m 2000 app.js           # cap a change burst at 2000 ms
nodeloop --exec "npm run dev"     # run a command instead of node
nodeloop --exec tsx src/main.ts   # run a TypeScript entry with tsx
nodeloop --node-args="--inspect" app.js
nodeloop --config nodeloop.toml app.js
nodeloop -q app.js                # quiet: show only your app's output
nodeloop -v app.js                # verbose diagnostics
nodeloop -V app.js                # verbose alias
nodeloop app.js -- --port 3000    # explicitly pass the remaining args to your app
```

| Flag | Long option              | Purpose                                                             |
| ---- | ------------------------ | ------------------------------------------------------------------- |
| `-e` | `--ext`                  | File extensions that trigger a restart.                             |
| `-i` | `--ignore`               | Additional file or directory names to ignore.                       |
| `-w` | `--watch`                | Restrict watching to selected path prefixes.                        |
| `-d` | `--delay`                | Debounce delay in milliseconds.                                     |
| `-m` | `--max-wait`             | Maximum wait during a continuous burst of changes; `0` disables it. |
| —    | `--exec`                 | Run a command other than the default Node process.                  |
| —    | `--node-args`            | Pass additional arguments to the Node executable.                   |
| —    | `--config`               | Load a specific configuration file.                                 |
| `-q` | `--quiet`                | Suppress nodeloop's status output.                                  |
| `-v` | `--verbose`              | Show detailed startup and restart diagnostics.                      |
| —    | `--color` / `--no-color` | Force or disable colored output.                                    |

**Argument rule:** runner flags go before the script. Arguments after the script belong to your application. Use `--` when you want to make that boundary explicit.

When no script is supplied, nodeloop checks the package.json `main` field, then `index.js`, then `server.js`. It does not execute package.json `scripts` automatically.

## ⚙️ Configuration

nodeloop checks the current working directory and uses the **first matching configuration file**:

| Priority | File                                 |
| :------: | ------------------------------------ |
|    1     | `nodeloop.json`                      |
|    2     | `.nodelooprc`                        |
|    3     | `nodeloop.toml`                      |
|    4     | `nodeloop.yaml` or `nodeloop.yml`    |
|    5     | `nodeloop.js`                        |
|    6     | `nodeloop.mjs`                       |
|    7     | `nodeloop.ts`                        |
|    8     | `nodeloop.mts`                       |
|    9     | `package.json` with a `nodeloop` key |

### Example: nodeloop.json

```json
{
  "script": "server.js",
  "ext": ["js", "mjs", "json"],
  "ignore": ["uploads", "dist"],
  "watch": ["packages/api"],
  "delay": 200,
  "maxWait": 2000,
  "killSignal": "SIGTERM",
  "killTimeout": 3000,
  "env": {
    "NODE_ENV": "development"
  },
  "verbose": true
}
```

You can also select a configuration file explicitly:

```bash
nodeloop --config my.nodeloop.toml app.js
```

### Supported configuration keys

| Key           | Type              | Default                   | Description                                                                      |
| ------------- | ----------------- | ------------------------- | -------------------------------------------------------------------------------- |
| `script`      | string            | —                         | Entry file to run. A CLI script argument takes priority.                         |
| `exec`        | string            | —                         | Command to run instead of Node, such as `npm run dev`.                           |
| `execMap`     | object            | —                         | Map extensions to commands, such as `{"ts":"tsx"}`. Used when `exec` is unset.   |
| `scriptArgs`  | array             | `[]`                      | Arguments passed after the script. `args` is an alias.                           |
| `ext`         | string or array   | `js,mjs,cjs,json`         | Extensions that trigger restarts.                                                |
| `ignore`      | string or array   | built-in defaults         | Additional ignored file or directory names.                                      |
| `watch`       | string or array   | current working directory | Paths to watch, relative to the working directory or absolute.                   |
| `delay`       | number            | `200`                     | Restart debounce window in milliseconds.                                         |
| `maxWait`     | number            | `0`                       | Maximum wait during continuous changes; `0` disables the limit.                  |
| `legacyWatch` | boolean or number | `false`                   | Polling fallback; `true` uses 1000 ms, or provide an interval of at least 50 ms. |
| `killSignal`  | string            | `SIGTERM`                 | Signal used to stop the child on restart. `signal` is an alias.                  |
| `killTimeout` | number            | `3000`                    | Time before the force-kill fallback.                                             |
| `env`         | object            | `{}`                      | Environment variables merged into the child environment.                         |
| `nodeArgs`    | array             | `[]`                      | Arguments passed to Node itself, such as `--inspect`.                            |
| `restartable` | string or false   | `rs`                      | Manual restart command. Set to `false` to disable it.                            |
| `colours`     | boolean           | `true`                    | Enable or disable terminal colors. `colors` is an alias.                         |
| `events`      | object            | —                         | Custom status messages for supported lifecycle events.                           |
| `verbose`     | boolean           | `false`                   | Show detailed restart diagnostics.                                               |
| `quiet`       | boolean           | `false`                   | Show only application output.                                                    |

CLI options override configuration values. The CLI `--ignore` option extends the configured ignore list.

### TOML example

```toml
script = "server.js"
ext = ["js", "mjs", "json"]
ignore = ["uploads", "dist"]
delay = 200
```

### YAML example

```yaml
script: server.js
ext: js,mjs,json
ignore:
  - uploads
  - dist
delay: 200
```

### Configuration notes

- JSON and `.nodelooprc` use strict JSON.
- JavaScript configuration follows the package's module type. Use `module.exports` in CommonJS projects and `export default` in ESM projects.
- `.mjs` and `.mts` are ESM configuration files. `.ts` and `.mts` require a Node.js version that supports the relevant built-in TypeScript handling.
- JavaScript and TypeScript config files are executed. Only load configuration code you trust.
- TOML and YAML support a documented subset of syntax. Unsupported syntax fails with a useful error instead of being silently guessed.
- A detected configuration file that fails to parse is reported as an error; nodeloop does not silently fall through to the next file.

## 🎨 Terminal experience

nodeloop uses a consistent status-line style with semantic icons:

| Icon | Meaning          |
| :--: | ---------------- |
| `●`  | Watcher active   |
| `▶`  | Process starting |
| `↻`  | Restarting       |
| `✓`  | Successful exit  |
| `✕`  | Failure          |
| `■`  | Stopping         |

The terminal adapts its output to the environment:

| Terminal environment        | Output                                     |
| --------------------------- | ------------------------------------------ |
| Truecolor terminal          | Full 24-bit palette                        |
| 256-color terminal          | Nearest xterm-256 colors                   |
| Basic terminal              | Readable 16-color palette                  |
| Piped or redirected output  | Plain output without ANSI styling          |
| `NO_COLOR=1`                | Disable colors                             |
| `FORCE_COLOR=1`, `2` or `3` | Force a color level                        |
| `NODELOOP_ASCII=1`          | Use ASCII symbols instead of Unicode icons |

Your application's stdout and stderr are passed through without nodeloop prefixes or recoloring. Use `-q` when you want only application output.

## 🦀 Native architecture

nodeloop is built from two parts:

- **TypeScript CLI:** command-line parsing, configuration, environment setup and terminal presentation.
- **Rust core through N-API:** native watching, restart timing and child-process supervision.

The native loader checks for a binary in this order:

1. `NODELOOP_NATIVE_PATH`, when explicitly set.
2. The matching installed platform package.
3. A local workspace build under `target/release` or `target/debug`.

### Platform package names

| Platform             | Native package                      |
| -------------------- | ----------------------------------- |
| Linux x64 (glibc)    | `@nodeloop/native-linux-x64-gnu`    |
| Linux ARM64 (glibc)  | `@nodeloop/native-linux-arm64-gnu`  |
| Windows x64 (MSVC)   | `@nodeloop/native-win32-x64-msvc`   |
| Windows ARM64 (MSVC) | `@nodeloop/native-win32-arm64-msvc` |

The native workflow contains a build matrix for these targets. The repository's native-package notes currently identify Linux x64 as the locally verified target; the remaining platform binaries should be treated as unverified until their CI builds are confirmed.

## 🧑‍💻 Development

Clone the repository and install the development dependencies:

```bash
git clone https://github.com/jubayerhossaindev/nodeloop.git
cd nodeloop
npm install --no-audit --no-fund --force
```

Useful commands:

| Command                  | Purpose                                                            |
| ------------------------ | ------------------------------------------------------------------ |
| `npm run build:native`   | Build and stage the Rust N-API addon for the current host.         |
| `npm run build`          | Compile the TypeScript package into `packages/nodeloop/dist`.      |
| `npm test`               | Run the TypeScript test suite.                                     |
| `npm run test:rust`      | Run Rust tests.                                                    |
| `npm run typecheck`      | Run TypeScript type checking.                                      |
| `npm run lint`           | Run the project lint checks.                                       |
| `npm run fmt:rust`       | Check Rust formatting.                                             |
| `npm run package:native` | Copy the built addon into the matching platform package directory. |
| `npm start`              | Run the repository's demo command.                                 |

For a local run after building:

```bash
npm run build:native
npm run build
node packages/nodeloop/dist/cli.js demo/app.ts
```

The CI workflow runs the main checks on Ubuntu with the package's declared Node.js version. The native workflow defines a separate operating-system and architecture build matrix.

## 🔍 nodeloop vs nodemon

Both tools automate the restart loop. nodemon has a broader and more established ecosystem; nodeloop focuses on a compact workflow with a Rust-powered native core.

| Capability                                       |       nodemon       |                   nodeloop                    |
| ------------------------------------------------ | :-----------------: | :-------------------------------------------: |
| Restart on file changes                          |         ✅          |                      ✅                       |
| Wait after a crash and restart on a later change |         ✅          |                      ✅                       |
| Extension, ignore and watch controls             |         ✅          |                      ✅                       |
| Configuration files                              | JSON and JavaScript | JSON, TOML, YAML, JS, TS and related variants |
| Run a custom command                             |         ✅          |                      ✅                       |
| Pass application arguments                       |         ✅          |                      ✅                       |
| Manual restart from a TTY                        |         ✅          |                      ✅                       |
| Quiet and verbose modes                          |         ✅          |                      ✅                       |
| Process-tree handling                            |         ✅          |                      ✅                       |
| Rust-powered native core                         |          —          |                      ✅                       |

## 🧩 Known limitations

- nodeloop currently requires Node.js `>=24.22.2`.
- Platform binaries must match the host operating system and architecture.
- TOML and YAML parsing intentionally supports a subset of each format.
- On Windows, `killSignal` cannot provide the same graceful POSIX signal behavior; process-tree shutdown uses the Windows termination mechanism.
- Manual `rs` restart requires an interactive TTY.
- The watcher operates from the current working directory. Run nodeloop from your project root if you want changes in that project to trigger restarts.
- For network drives, containers or filesystems where native change notifications are unreliable, enable `legacyWatch` polling in the configuration.

## 🛠️ Troubleshooting

<details>
  <summary><strong>Native binary not found</strong></summary>

Build the addon from the repository root, or make sure the matching `@nodeloop/native-*` package is installed:

```bash
npm run build:native
```

You can also point the loader at a specific binary with `NODELOOP_NATIVE_PATH`.
</details>

<details>
  <summary><strong>Linux reports ENOSPC or an inotify limit</strong></summary>

A large project can exceed the Linux inotify watch limit. Increase it for the current session:

```bash
sudo sysctl fs.inotify.max_user_watches=524288
```

To make the change persistent, add the setting to your system's sysctl configuration.
</details>

<details>
  <summary><strong>Changes are missed on WSL, network drives or mounted folders</strong></summary>

Native filesystem notifications can be unreliable on some mounted or network filesystems. Enable the polling fallback:

```json
{
  "legacyWatch": true
}
```

</details>

<details>
  <summary><strong>The app restarts too often while build files are generated</strong></summary>

Ignore generated directories or cap the restart window:

```bash
nodeloop -i dist,build -m 2000 app.js
```

</details>

<details>
  <summary><strong>Colors or icons look wrong in a terminal</strong></summary>

Use `NO_COLOR=1` to disable colors or `NODELOOP_ASCII=1` to switch to ASCII symbols. Piped output is automatically kept plain for log-friendly use.
</details>

## 📄 License

Apache License 2.0 © [jubayerhossaindev](https://github.com/jubayerhossaindev)

<p align="center">
  <sub>Built with ❤️ for developers who want to spend less time restarting and more time building.</sub>
</p>
