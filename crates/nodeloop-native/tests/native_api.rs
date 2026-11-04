//! Node-driven integration tests for the N-API bridge.
//!
//! The `#[napi]` macro generates `extern "C"` wrappers around our Rust
//! functions; those wrappers can ONLY be invoked from a real Node runtime
//! (they need a `napi_env` + `JsFunction` + the threadsafe-function
//! machinery). Unit tests can't link against Node, so we spawn Node as a
//! subprocess, load the compiled `.node` cdylib, call every binding, and
//! assert the results via stdout JSON.
//!
//! Coverage: cargo-llvm-cov instruments the cdylib the same way it
//! instruments the rlib. When Node loads the instrumented `.node` and
//! invokes a binding, the coverage counters fire and merge into the same
//! `.profraw` file (we forward `LLVM_PROFILE_FILE` to the Node subprocess).
//!
//! Find the cdylib: `env!("CARGO_MANIFEST_DIR")/target/<profile>/libnodeloop_native.so`.
//! We compute the profile (debug/release) from `cfg!(debug_assertions)`.

use std::path::PathBuf;
use std::process::Command;

/// Candidate paths for the compiled cdylib, in preference order.
///
/// The test binary runs from `<target>/<profile>/deps/<test-binary-hash>`.
/// cargo places the cdylib at `<target>/<profile>/deps/libnodeloop_native.so`
/// and normally ALSO hardlinks it to `<target>/<profile>/libnodeloop_native.so`
/// — but under `cargo llvm-cov` (which builds via `cargo test`) the deps/
/// copy is the only one, so BOTH locations must be probed. Under coverage
/// the deps/ copy is the INSTRUMENTED one — loading it is what makes the
/// Node child's counters merge into the coverage report.
fn cdylib_candidates() -> Vec<PathBuf> {
    let exe = std::env::current_exe().expect("test exe path available");
    let profile_dir = exe
        .parent()
        .expect("test binary has a parent (deps/) directory")
        .parent()
        .expect("deps/ has a parent (profile) directory");
    let filename = if cfg!(target_os = "linux") {
        "libnodeloop_native.so"
    } else if cfg!(target_os = "macos") {
        "libnodeloop_native.dylib"
    } else if cfg!(target_os = "windows") {
        "nodeloop_native.dll"
    } else {
        panic!("unsupported target OS for nodeloop-native integration test");
    };
    vec![
        profile_dir.join(filename),
        profile_dir.join("deps").join(filename),
    ]
}

fn cdylib_path() -> PathBuf {
    cdylib_candidates()
        .into_iter()
        .find(|p| p.exists())
        .expect("cdylib missing from every candidate location (checked profile root and deps/)")
}

fn node_available() -> bool {
    Command::new("node")
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .is_ok()
}

/// JS source that loads the .node, calls each binding, prints JSON results.
/// `process.dlopen` accepts any path regardless of file extension — we don't
/// need to rename to .node.
fn js_harness(lib_path: &str, watch_cwd: &str) -> String {
    format!(
        r#"(async () => {{
  const path = {lib_path:?};
  const mod = {{ exports: {{}} }};
  try {{
    process.dlopen(mod, path);
  }} catch (e) {{
    console.log(JSON.stringify({{ fatal: "dlopen failed: " + e.message }}));
    process.exit(0);
  }}
  const native = mod.exports;
  const out = {{}};

  // 1. coreVersion() -> string
  out.coreVersion = native.coreVersion();

  // 2. coreInfo() -> {{ version, platform }}
  out.coreInfo = native.coreInfo();

  // 3. resolveSpawn — bare node + script args
  out.resolveSpawnNode = native.resolveSpawn("", ["--inspect"], "app.js", ["--port", "3000"], "linux", "/usr/bin/node");

  // 4. resolveSpawn — POSIX bare command
  out.resolveSpawnPosix = native.resolveSpawn("tsx src/main.ts", [], null, [], "linux", "/usr/bin/node");

  // 5. resolveSpawn — Windows bare command goes through shell
  out.resolveSpawnWin = native.resolveSpawn("npm run dev", [], null, [], "win32", "C:\\node.exe");

  // 6. watcherStart -> id (a long-running sleep so we can probe state).
  // cwd is a quiet tempdir the Rust test created — /tmp itself is too busy
  // (other test scripts write there) and would trigger spurious changes.
  // Use an absolute path to `sleep` because the spawned child clears its
  // env then re-inherits it from Node — under cargo-llvm-cov the PATH
  // passthrough is occasionally missing, breaking bare-name lookup.
  const events = [];
  const id = native.watcherStart(
    JSON.stringify({{
      scriptArgs: [],
      cwd: {watch_cwd:?},
      exec: "/usr/bin/sleep 30",
      nodeArgs: [],
      ext: "js,mjs",
      ignore: [],
      watch: [],
      pollInterval: 0,
      env: {{}},
    }}),
    (_err, msg) => {{ if (msg) events.push(msg); }}
  );
  out.watcherStartId = id;
  out.watcherStartType = typeof id;

  // 7. watcherChildAlive — true while sleep 30 runs
  // wait briefly for the Spawn event to land
  await new Promise((r) => setTimeout(r, 800));
  out.childAliveAfterStart = native.watcherChildAlive(id);
  out.eventsReceived = events;
  out.spawnEventSeen = events.some((e) => {{
    try {{ return JSON.parse(e).type === "spawn"; }} catch (_) {{ return false; }}
  }});

  // 8. watcherRestart -> ok
  let restartOk = false;
  try {{ native.watcherRestart(id); restartOk = true; }} catch (e) {{ out.restartError = e.message; }}
  out.watcherRestartOk = restartOk;
  // wait briefly for the Restart + Spawn events
  await new Promise((r) => setTimeout(r, 500));

  // 9. watcherWriteStdin — non-interactive child → false
  out.writeStdinNonInteractive = native.watcherWriteStdin(id, Buffer.from("hi"));

  // 10. watcherStop -> ok (returns void/undefined)
  let stopOk = false;
  try {{ native.watcherStop(id); stopOk = true; }} catch (e) {{ out.stopError = e.message; }}
  out.watcherStopOk = stopOk;

  // 11. watcherStop on a stopped/unknown id -> throws
  let stopAgainError = null;
  try {{ native.watcherStop(id); }} catch (e) {{ stopAgainError = e.message; }}
  out.watcherStopAgainError = stopAgainError;

  // 12. watcherRestart on unknown id -> throws
  let restartUnknownError = null;
  try {{ native.watcherRestart(999999); }} catch (e) {{ restartUnknownError = e.message; }}
  out.watcherRestartUnknownError = restartUnknownError;

  // 13. watcherWriteStdin on unknown id -> throws
  let writeUnknownError = null;
  try {{ native.watcherWriteStdin(999999, Buffer.from("x")); }} catch (e) {{ writeUnknownError = e.message; }}
  out.watcherWriteStdinUnknownError = writeUnknownError;

  // 14. watcherChildAlive on unknown id -> throws
  let aliveUnknownError = null;
  try {{ native.watcherChildAlive(999999); }} catch (e) {{ aliveUnknownError = e.message; }}
  out.watcherChildAliveUnknownError = aliveUnknownError;

  // 15. watcherStart with INVALID config JSON -> throws
  let invalidConfigError = null;
  try {{
    native.watcherStart("{{not json}}", (msg) => {{}});
  }} catch (e) {{ invalidConfigError = e.message; }}
  out.watcherStartInvalidConfigError = invalidConfigError;

  // 16. watcherStart with INVALID options (delay=0) -> throws
  let invalidOptsError = null;
  try {{
    native.watcherStart(JSON.stringify({{
      scriptArgs: [], cwd: "/tmp", nodeArgs: [], ignore: [], watch: [],
      delay: 0, pollInterval: 0, env: {{}},
    }}), (msg) => {{}});
  }} catch (e) {{ invalidOptsError = e.message; }}
  out.watcherStartInvalidOptsError = invalidOptsError;

  console.log(JSON.stringify(out));
}})().catch((e) => {{
  console.log(JSON.stringify({{ fatal: String(e && e.message || e) }}));
}});
"#,
        lib_path = lib_path,
    )
}

#[test]
fn napi_bindings_round_trip_through_node() {
    if !node_available() {
        eprintln!("node not on PATH — skipping Node-driven N-API integration test");
        return;
    }
    let candidates = cdylib_candidates();
    if !candidates.iter().any(|p| p.exists()) {
        // `cargo test --test <name>` only builds the rlib flavor of
        // nodeloop-native, not the cdylib that Node needs to load. Build
        // it explicitly here so the test is self-contained. The build is
        // a no-op when the cdylib is already up to date.
        let manifest = env!("CARGO_MANIFEST_DIR");
        let target_dir = candidates[0]
            .parent()
            .expect("lib has parent")
            .parent()
            .expect("lib has grandparent"); // <target>/<profile>
        let status = Command::new("cargo")
            .arg("build")
            .arg("--manifest-path")
            .arg(format!("{manifest}/Cargo.toml"))
            .arg("-p")
            .arg("nodeloop-native")
            .arg("--lib")
            .arg("--target-dir")
            .arg(target_dir)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::inherit())
            .status();
        match status {
            Ok(s) if s.success() => {},
            Ok(s) => panic!("cargo build of nodeloop-native cdylib failed: {s}"),
            Err(e) => panic!("could not invoke cargo to build cdylib: {e}"),
        }
        assert!(
            candidates.iter().any(|p| p.exists()),
            "cdylib still missing at {} after cargo build",
            candidates[0].display()
        );
    }
    let lib = cdylib_path();

    // create a quiet tempdir for the watcher's cwd — /tmp itself is too
    // busy (other processes write .js files there) and would trigger
    // spurious Change → Restart chains that race the assertions.
    // KEEP THE TempDir GUARD ALIVE across the Node subprocess — once it
    // drops, the dir is deleted and the child's cwd vanishes, producing
    // misleading ENOENT spawns.
    let watch_cwd_guard = tempfile::tempdir().expect("tempdir for watcher cwd");
    let watch_cwd = watch_cwd_guard.path().to_string_lossy().to_string();

    let js = js_harness(&lib.to_string_lossy(), &watch_cwd);
    // Forward LLVM_PROFILE_FILE so coverage instrumentation in the .node
    // writes to the same profraw as the Rust test binary.
    let output = Command::new("node")
        .arg("-e")
        .arg(&js)
        .env(
            "LLVM_PROFILE_FILE",
            std::env::var("LLVM_PROFILE_FILE").unwrap_or_default(),
        )
        .output()
        .expect("node spawns");

    if !output.status.success() {
        panic!(
            "node exited with status {}: stderr={}",
            output.status,
            String::from_utf8_lossy(&output.stderr)
        );
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let line = stdout.lines().last().unwrap_or("");
    let parsed: serde_json::Value = serde_json::from_str(line).unwrap_or_else(|e| {
        panic!(
            "failed to parse Node stdout as JSON: {e}\nstdout:\n{stdout}\nstderr:\n{}",
            String::from_utf8_lossy(&output.stderr)
        )
    });

    let obj = parsed.as_object().expect("expected JSON object");
    assert!(
        !obj.contains_key("fatal"),
        "Node harness failed: {}",
        obj.get("fatal").unwrap()
    );

    // 1. coreVersion
    assert_eq!(obj["coreVersion"], "1.0.0");

    // 2. coreInfo
    assert_eq!(obj["coreInfo"]["version"], "1.0.0");
    assert!(
        obj["coreInfo"]["platform"].is_string(),
        "platform must be a string"
    );

    // 3. resolveSpawn — bare node
    assert_eq!(obj["resolveSpawnNode"]["file"], "/usr/bin/node");
    assert_eq!(obj["resolveSpawnNode"]["shell"], false);

    // 4. resolveSpawn — POSIX bare command
    assert_eq!(obj["resolveSpawnPosix"]["file"], "tsx");
    assert_eq!(obj["resolveSpawnPosix"]["shell"], false);

    // 5. resolveSpawn — Windows shell
    assert_eq!(obj["resolveSpawnWin"]["shell"], true);

    // 6. watcherStart returns a numeric id
    assert_eq!(obj["watcherStartType"], "number");
    let id = obj["watcherStartId"].as_i64().expect("id is an integer");
    assert!(id >= 1, "watcherStartId must be >= 1, got {id}");

    // 7. watcherChildAlive + spawn event seen
    assert_eq!(obj["childAliveAfterStart"], true);
    assert_eq!(obj["spawnEventSeen"], true);

    // 8. watcherRestart succeeds
    assert_eq!(obj["watcherRestartOk"], true);

    // 9. watcherWriteStdin on non-interactive child → false
    assert_eq!(obj["writeStdinNonInteractive"], false);

    // 10. watcherStop succeeds
    assert_eq!(obj["watcherStopOk"], true);

    // 11. watcherStop on a stopped id → throws
    assert!(
        obj["watcherStopAgainError"].is_string(),
        "expected error string for double-stop, got: {}",
        obj["watcherStopAgainError"]
    );

    // 12-14. unknown-id errors
    assert!(obj["watcherRestartUnknownError"].is_string());
    assert!(obj["watcherWriteStdinUnknownError"].is_string());
    assert!(obj["watcherChildAliveUnknownError"].is_string());

    // 15. invalid config JSON → throws
    assert!(
        obj["watcherStartInvalidConfigError"].is_string(),
        "expected error for invalid JSON, got: {}",
        obj["watcherStartInvalidConfigError"]
    );

    // 16. invalid options → throws
    assert!(obj["watcherStartInvalidOptsError"].is_string());
}
