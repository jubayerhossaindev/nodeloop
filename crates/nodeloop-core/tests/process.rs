//! Integration tests for the process layer: real spawns through
//! `spawn_child`, inherited stdio, tree kills.

use nodeloop_core::process::command::{SpawnSpec, resolve_spawn, spawn_child};
use std::time::Duration;

fn node_path() -> String {
    std::env::var("NODELOOP_NODE_PATH").unwrap_or_else(|_| "node".into())
}

#[test]
fn spawn_child_runs_echo_successfully() {
    // the minimal reproduction of the CLI smoke test: exec "echo X" must
    // exit 0 through the exact same spawn path the supervisor uses
    let spec = resolve_spawn(
        Some("echo INHERIT-MARK"),
        &[],
        None,
        &[],
        "linux",
        &node_path(),
    );
    assert_eq!(spec.file, "echo");
    let mut child = spawn_child(&spec, "/tmp", &[], false).expect("spawn works");
    let status = child.child.wait().expect("wait works");
    assert!(
        status.success(),
        "echo must exit 0 through spawn_child, got {status}"
    );
}

#[test]
fn spawn_child_piped_stdin_writes_reach_the_child() {
    let script = std::env::temp_dir().join("nodeloop-stdin-probe.js");
    std::fs::write(
        &script,
        "let b='';process.stdin.on('data',d=>b+=d);process.stdin.on('end',()=>require('fs').writeFileSync('/tmp/nodeloop-stdin-probe.txt',b));",
    )
    .unwrap();
    let spec = resolve_spawn(
        None,
        &[],
        Some(script.to_str().unwrap()),
        &[],
        "linux",
        &node_path(),
    );
    let mut child = spawn_child(&spec, "/tmp", &[], true).expect("spawn works");
    {
        use std::io::Write;
        // take() — the pipe must CLOSE for the child to see 'end'
        let mut stdin = child.stdin.take().expect("stdin piped");
        stdin.write_all(b"HELLO-STDIN").unwrap();
        stdin.flush().unwrap();
    }
    let _ = child.child.wait();
    let written = std::fs::read_to_string("/tmp/nodeloop-stdin-probe.txt").unwrap_or_default();
    let _ = std::fs::remove_file("/tmp/nodeloop-stdin-probe.txt");
    assert_eq!(written.trim(), "HELLO-STDIN");
}

#[test]
fn tree_kill_takes_down_grandchildren() {
    // sh -c 'sleep 30 & sleep 30' → both sleeps live in the child's group;
    // kill_tree must end the whole group
    let spec = SpawnSpec {
        file: "/bin/sh".into(),
        args: vec!["-c".into(), "sleep 30 & sleep 30".into()],
        shell: false,
    };
    let mut child = spawn_child(&spec, "/tmp", &[], false).unwrap();
    let pid = child.pid;
    std::thread::sleep(Duration::from_millis(200));
    assert!(nodeloop_core::process::tree::kill_tree(pid, "SIGKILL"));
    let status = child.child.wait().unwrap();
    assert!(!status.success());
}

#[test]
fn env_merge_reaches_the_child() {
    let script = std::env::temp_dir().join("nodeloop-env-probe.js");
    std::fs::write(
        &script,
        "require('fs').writeFileSync('/tmp/nodeloop-env-probe.txt', String(process.env.NODELOOP_PROBE_VAR));",
    )
    .unwrap();
    let _ = std::fs::remove_file("/tmp/nodeloop-env-probe.txt");
    let spec = resolve_spawn(
        None,
        &[],
        Some(script.to_str().unwrap()),
        &[],
        "linux",
        &node_path(),
    );
    let mut child = spawn_child(
        &spec,
        "/tmp",
        &[("NODELOOP_PROBE_VAR".into(), "42".into())],
        false,
    )
    .unwrap();
    let _ = child.child.wait();
    let written = std::fs::read_to_string("/tmp/nodeloop-env-probe.txt").unwrap_or_default();
    let _ = std::fs::remove_file("/tmp/nodeloop-env-probe.txt");
    assert_eq!(written, "42");
}

#[test]
fn missing_executable_reports_spawn_error_not_exit() {
    let spec = SpawnSpec {
        file: "/nonexistent-nodeloop-binary-xyz".into(),
        args: vec![],
        shell: false,
    };
    let err = spawn_child(&spec, "/tmp", &[], false);
    assert!(err.is_err(), "spawn must fail with an io::Error (ENOENT)");
}
