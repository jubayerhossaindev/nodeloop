//! Integration tests for the host-facing Supervisor — drives the full
//! run loop on its own thread and exercises every public method against
//! real (short-lived) child processes.
//!
//! These tests target `process::supervisor::Supervisor` directly (the
//! 0%-coverage file in the baseline); the engine internals are exercised
//! by `engine::runtime` unit tests.

use std::sync::Arc;
use std::sync::mpsc::channel;
use std::time::Duration;

use nodeloop_core::Event;
use nodeloop_core::Supervisor;
use nodeloop_core::config::RuntimeOptions;
use nodeloop_core::types::Backend;

fn opts_with_exec(exec: Option<&str>, interactive: bool) -> RuntimeOptions {
    RuntimeOptions::build(
        None,
        vec![],
        std::env::temp_dir().to_string_lossy().to_string(),
        exec.map(|s| s.to_string()),
        vec![],
        vec![],
        vec![],
        vec![],
        None,
        None,
        None,
        None,
        Backend::Events,
        vec![],
        interactive,
    )
    .expect("valid test opts")
}

/// Collect every event currently buffered on the receiver.
fn drain(rx: &std::sync::mpsc::Receiver<Event>) -> Vec<Event> {
    let mut out = Vec::new();
    while let Ok(e) = rx.try_recv() {
        out.push(e);
    }
    out
}

/// Wait for an event of a given shape, draining unrelated ones; times out
/// after 5s.
fn wait_for_event(
    rx: &std::sync::mpsc::Receiver<Event>,
    predicate: impl Fn(&Event) -> bool,
) -> Option<Event> {
    let deadline = std::time::Instant::now() + Duration::from_secs(5);
    while std::time::Instant::now() < deadline {
        if let Ok(e) = rx.recv_timeout(Duration::from_millis(100))
            && predicate(&e)
        {
            return Some(e);
        }
    }
    None
}

#[test]
fn supervisor_starts_and_emits_spawn_for_long_running_child() {
    // a child that sleeps long enough for us to observe the Spawn banner
    // before it exits on its own
    let (tx, rx) = channel::<Event>();
    let opts = opts_with_exec(Some("sleep 30"), false);
    let mut sup = Supervisor::start(opts, tx).expect("supervisor starts");
    let spawn = wait_for_event(&rx, |e| matches!(e, Event::Spawn { .. }));
    assert!(spawn.is_some(), "Spawn event must arrive for sleep 30");
    assert!(
        sup.child_alive(),
        "child_alive must be true while sleep runs"
    );
    // clean shutdown
    sup.stop();
    sup.join();
    // Stopped arrives after join drains the run loop
    let stopped = wait_for_event(&rx, |e| matches!(e, Event::Stopped));
    assert!(
        stopped.is_some(),
        "Stopped event must arrive after stop+join"
    );
}

#[test]
fn supervisor_debug_format_carries_liveness_and_stopped() {
    // the Debug impl surfaces child_alive + stopped (no thread handle in
    // the output) — host bridges log this for diagnostics
    let (tx, _rx) = channel::<Event>();
    let opts = opts_with_exec(Some("sleep 30"), false);
    let mut sup = Supervisor::start(opts, tx).expect("supervisor starts");
    // wait briefly so child_alive flips true (the spawn is async via thread)
    let deadline = std::time::Instant::now() + Duration::from_secs(2);
    while !sup.child_alive() && std::time::Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(20));
    }
    let s = format!("{:?}", sup);
    assert!(s.contains("Supervisor"));
    assert!(s.contains("child_alive"));
    assert!(s.contains("stopped"));
    sup.stop();
    sup.join();
    // after stop, the Debug output reflects the stopped flag
    let s_after = format!("{:?}", sup);
    assert!(s_after.contains("stopped: true"));
}

#[test]
fn supervisor_restart_manual_when_stopped_returns_stopped_error() {
    // calling restart_manual AFTER stop must return CoreError::Stopped —
    // legacy parity: the host UI surfaces "couldn't restart, supervisor gone"
    let (tx, _rx) = channel::<Event>();
    let opts = opts_with_exec(Some("sleep 30"), false);
    let mut sup = Supervisor::start(opts, tx).expect("supervisor starts");
    sup.stop();
    sup.join();
    let err = sup.restart_manual();
    assert!(
        matches!(err, Err(nodeloop_core::error::CoreError::Stopped)),
        "expected Stopped error, got {err:?}"
    );
}

#[test]
fn supervisor_restart_manual_when_running_delivers_restart_control() {
    // a running supervisor accepts RestartManual; the run loop turns it
    // into a Restart banner + new Spawn
    let (tx, rx) = channel::<Event>();
    let opts = opts_with_exec(Some("sleep 30"), false);
    let mut sup = Supervisor::start(opts, tx).expect("supervisor starts");
    // wait for first Spawn
    let _ = wait_for_event(&rx, |e| matches!(e, Event::Spawn { .. }));
    // drain anything else
    std::thread::sleep(Duration::from_millis(50));
    let _ = drain(&rx);
    // fire a manual restart
    sup.restart_manual().expect("restart_manual ok");
    // a Restart banner + new Spawn must arrive
    let restart = wait_for_event(&rx, |e| matches!(e, Event::Restart { .. }));
    assert!(
        restart.is_some(),
        "Restart event must arrive after restart_manual"
    );
    let spawn2 = wait_for_event(&rx, |e| matches!(e, Event::Spawn { .. }));
    assert!(spawn2.is_some(), "second Spawn must arrive after restart");
    sup.stop();
    sup.join();
}

#[test]
fn supervisor_write_stdin_when_no_child_returns_false() {
    // before any spawn lands, write_stdin must reject without panicking
    let (tx, _rx) = channel::<Event>();
    // a child that exits immediately → after drain, child_alive is false
    let opts = opts_with_exec(Some("true"), true);
    let mut sup = Supervisor::start(opts, tx).expect("supervisor starts");
    // wait for the child to spawn + exit (true exits at once)
    let deadline = std::time::Instant::now() + Duration::from_secs(2);
    while sup.child_alive() && std::time::Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(20));
    }
    // child has exited — write must return false (no live child)
    assert!(
        !sup.write_stdin(b"hello"),
        "write_stdin must return false after exit"
    );
    sup.stop();
    sup.join();
}

#[test]
fn supervisor_write_stdin_when_interactive_child_alive_returns_true() {
    // an interactive stdin pipe + a long-running child that READS stdin
    // → write_stdin must succeed
    let script = std::env::temp_dir().join("nodeloop-supervisor-stdin-probe.js");
    std::fs::write(
        &script,
        "let b='';process.stdin.on('data',d=>b+=d);process.stdin.on('end',()=>{});setInterval(()=>{},1000);",
    )
    .unwrap();
    let opts = RuntimeOptions::build(
        Some(script.to_str().unwrap().to_string()),
        vec![],
        std::env::temp_dir().to_string_lossy().to_string(),
        None, // exec=None → use node
        vec![],
        vec![],
        vec![],
        vec![],
        None,
        None,
        None,
        None,
        Backend::Events,
        vec![],
        true, // interactive_stdin
    )
    .expect("valid opts");
    let (tx, _rx) = channel::<Event>();
    let mut sup = Supervisor::start(opts, tx).expect("supervisor starts");
    // wait for child_alive to flip true
    let deadline = std::time::Instant::now() + Duration::from_secs(5);
    while !sup.child_alive() && std::time::Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(20));
    }
    assert!(sup.child_alive(), "interactive child must be alive");
    // write must succeed — the child's stdin is piped + readable
    let ok = sup.write_stdin(b"HELLO-NATIVE");
    assert!(
        ok,
        "write_stdin must return true for a live interactive child"
    );
    sup.stop();
    sup.join();
}

#[test]
fn supervisor_write_stdin_with_noninteractive_child_returns_false() {
    // interactive_stdin=false → no stdin pipe was opened → write_stdin
    // must return false even when the child is alive
    let (tx, _rx) = channel::<Event>();
    let opts = opts_with_exec(Some("sleep 30"), false); // non-interactive
    let mut sup = Supervisor::start(opts, tx).expect("supervisor starts");
    let deadline = std::time::Instant::now() + Duration::from_secs(2);
    while !sup.child_alive() && std::time::Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(20));
    }
    assert!(sup.child_alive());
    // no stdin slot was opened — write must fail
    assert!(
        !sup.write_stdin(b"data"),
        "write_stdin must return false when interactive_stdin was disabled"
    );
    sup.stop();
    sup.join();
}

#[test]
fn supervisor_join_without_stop_is_a_noop_safe_call() {
    // join() takes the thread handle; if Stop was never sent, join() blocks
    // forever. Calling it AFTER stop is the safe pattern. Verify join() with
    // no thread left (called twice) is also safe — the Option<JoinHandle>
    // pattern makes the second call a no-op.
    let (tx, _rx) = channel::<Event>();
    let opts = opts_with_exec(Some("sleep 30"), false);
    let mut sup = Supervisor::start(opts, tx).expect("supervisor starts");
    sup.stop();
    sup.join();
    // second join is a no-op — must not panic
    sup.join();
}

#[test]
fn supervisor_emits_exit_and_crash_for_failing_child() {
    // exec a child that exits with a non-zero code → Exit + Crash events
    // arrive (the legacy crash-detection path)
    let (tx, rx) = channel::<Event>();
    let opts = opts_with_exec(Some("sh -c \"exit 7\""), false);
    let mut sup = Supervisor::start(opts, tx).expect("supervisor starts");
    let exit = wait_for_event(&rx, |e| {
        matches!(
            e,
            Event::Exit {
                code: Some(7),
                signal: None
            }
        )
    });
    assert!(exit.is_some(), "Exit event with code=7 must arrive");
    let crash = wait_for_event(&rx, |e| matches!(e, Event::Crash { code: Some(7) }));
    assert!(crash.is_some(), "Crash event with code=7 must follow");
    sup.stop();
    sup.join();
}

#[test]
fn supervisor_emits_spawn_error_for_missing_executable() {
    // a bogus exec path → SpawnError with ENOENT — the legacy parity shape
    let (tx, rx) = channel::<Event>();
    let opts = opts_with_exec(Some("/nonexistent-nodeloop-binary-xyz"), false);
    let mut sup = Supervisor::start(opts, tx).expect("supervisor starts");
    let err = wait_for_event(&rx, |e| {
        matches!(
            e,
            Event::SpawnError { code: Some(c), .. } if c == "ENOENT"
        )
    });
    assert!(
        err.is_some(),
        "SpawnError with ENOENT must arrive for missing exec"
    );
    sup.stop();
    sup.join();
}

#[test]
fn supervisor_arc_atomic_flags_reflect_lifecycle() {
    // the supervisor's internal AtomicBool flags are observable from the
    // host through the public API — verify they flip in the right order
    let (tx, _rx) = channel::<Event>();
    let opts = opts_with_exec(Some("sleep 30"), false);
    let mut sup = Supervisor::start(opts, tx).expect("supervisor starts");
    // child_alive flips true once Spawn lands
    let deadline = std::time::Instant::now() + Duration::from_secs(2);
    while !sup.child_alive() && std::time::Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(20));
    }
    assert!(sup.child_alive());
    sup.stop();
    sup.join();
    // after join, the supervisor is quiescent — child_alive reflects the
    // final kill
    let deadline = std::time::Instant::now() + Duration::from_secs(2);
    while sup.child_alive() && std::time::Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(20));
    }
    assert!(
        !sup.child_alive(),
        "child_alive must be false after stop+join"
    );
    // hold an Arc to silence any "unused Arc" warning in the test scaffolding
    let _arc: Arc<()> = Arc::new(());
}

#[test]
fn supervisor_write_stdin_returns_false_after_child_pipe_closes() {
    // covers the write_stdin "Err(_) => { guard.take(); child_alive=false;
    // false }" branch — the pipe is gone because the child exited mid-write.
    //
    // Recipe: an interactive child that reads stdin + exits after a single
    // line. Once it exits, the pipe closes; a subsequent write_stdin must
    // return false AND clear child_alive.
    let script = std::env::temp_dir().join("nodeloop-supervisor-pipe-probe.js");
    std::fs::write(
        &script,
        // read ONE line then exit 0 — the pipe closes when the child dies
        "process.stdin.once('data',()=>process.exit(0));",
    )
    .unwrap();
    let opts = RuntimeOptions::build(
        Some(script.to_str().unwrap().to_string()),
        vec![],
        std::env::temp_dir().to_string_lossy().to_string(),
        None,
        vec![],
        vec![],
        vec![],
        vec![],
        None,
        None,
        None,
        None,
        Backend::Events,
        vec![],
        true, // interactive_stdin
    )
    .expect("valid opts");
    let (tx, _rx) = channel::<Event>();
    let mut sup = Supervisor::start(opts, tx).expect("supervisor starts");
    // wait for child_alive=true
    let deadline = std::time::Instant::now() + Duration::from_secs(3);
    while !sup.child_alive() && std::time::Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(20));
    }
    assert!(sup.child_alive(), "interactive child must be alive");
    // first write succeeds + triggers the child's exit
    assert!(sup.write_stdin(b"bye"), "first write must succeed");
    // wait for the child to actually exit + the waiter thread to clear
    // child_alive
    let deadline = std::time::Instant::now() + Duration::from_secs(3);
    while sup.child_alive() && std::time::Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(20));
    }
    // a write after the child died must return false (pipe closed) —
    // this exercises the Err arm of write_stdin's match
    let ok = sup.write_stdin(b"after-exit");
    assert!(
        !ok,
        "write_stdin must return false after the child's pipe closed, got {ok}"
    );
    sup.stop();
    sup.join();
}

#[test]
fn supervisor_write_stdin_fails_when_child_closed_its_stdin() {
    // covers write_stdin's `Err(_) => { guard.take(); child_alive=false;
    // false }` arm DETERMINISTICALLY: the child is `sh -c 'exec 0<&-;
    // exec sleep 30'` — sh closes fd 0 (the pipe's read end) and stays
    // alive, so child_alive is still true when we write. The write hits
    // a dead pipe (EPIPE) → Err arm.
    //
    // (SIG_IGN dispositions survive exec, but a CLOSED descriptor is the
    // cleanest way to break the pipe without racing the exit.)
    let opts = opts_with_exec(Some("sh -c 'exec 0<&-; exec sleep 30'"), true);
    let (tx, _rx) = channel::<Event>();
    let mut sup = Supervisor::start(opts, tx).expect("supervisor starts");
    let deadline = std::time::Instant::now() + Duration::from_secs(3);
    while !sup.child_alive() && std::time::Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(20));
    }
    assert!(sup.child_alive(), "the sleep child must be alive");
    // give sh a moment to actually execute `exec 0<&-`
    std::thread::sleep(Duration::from_millis(300));
    assert!(
        sup.child_alive(),
        "child still alive — sleep 30 keeps running after fd 0 closed"
    );
    // the write MUST fail (EPIPE) and clear child_alive via the Err arm
    let ok = sup.write_stdin(b"broken-pipe-write");
    assert!(
        !ok,
        "write_stdin must return false on a broken pipe, got {ok}"
    );
    assert!(!sup.child_alive(), "the Err arm must clear child_alive");
    sup.stop();
    sup.join();
}

/// Options with a TERM-ignoring child + a short kill timeout, for driving
/// the SIGKILL escalation paths deterministically.
///
/// `sh -c 'trap "" TERM; exec sleep 30'` — the trap sets SIGTERM to SIG_IGN
/// and IGNORED dispositions survive exec(), so `sleep` itself ignores
/// SIGTERM. A process-group SIGTERM cannot kill this tree; only the
/// killTimeout SIGKILL fallback can.
fn escalation_opts(kill_timeout_ms: u64, cwd: &str) -> RuntimeOptions {
    RuntimeOptions::build(
        None,
        vec![],
        cwd.to_string(),
        Some("sh -c 'trap \"\" TERM; exec sleep 30'".to_string()),
        vec![],
        vec![],
        vec![],
        vec![],
        None,
        None,
        None,
        Some(kill_timeout_ms),
        Backend::Events,
        vec![],
        false,
    )
    .expect("valid escalation opts")
}

#[test]
fn restart_escalates_to_sigkill_when_child_ignores_sigterm() {
    // covers engine::runtime restart()'s kill-escalation thread: the
    // tree ignores SIGTERM, so after killTimeout the SIGKILL fallback
    // fires, the child dies, ChildExit arrives, and the respawn happens.
    let tmp = tempfile::tempdir().unwrap();
    let (tx, rx) = channel::<Event>();
    let opts = escalation_opts(300, tmp.path().to_str().unwrap());
    let mut sup = Supervisor::start(opts, tx).expect("supervisor starts");
    let _ = wait_for_event(&rx, |e| matches!(e, Event::Spawn { .. }));
    std::thread::sleep(Duration::from_millis(150)); // let the trap settle
    let _ = drain(&rx);

    sup.restart_manual().expect("restart_manual ok");

    // Restart banner → Stopping → (SIGTERM ignored) → SIGKILL escalation →
    // new Spawn after the ChildExit
    let restart = wait_for_event(&rx, |e| matches!(e, Event::Restart { .. }));
    assert!(restart.is_some(), "Restart banner must ship");
    let stopping = wait_for_event(&rx, |e| matches!(e, Event::Stopping));
    assert!(stopping.is_some(), "Stopping must ship for a live child");
    let respawn = wait_for_event(&rx, |e| matches!(e, Event::Spawn { restarts: 1 }));
    assert!(
        respawn.is_some(),
        "a respawn must follow the SIGKILL escalation"
    );
    sup.stop();
    sup.join();
}

#[test]
fn stop_escalates_to_sigkill_when_child_ignores_sigterm() {
    // covers on_stop()'s bounded wait + SIGKILL fallback: the tree ignores
    // SIGTERM, so stop() waits killTimeout, sees the child still alive,
    // and sends SIGKILL before reporting Stopped.
    let tmp = tempfile::tempdir().unwrap();
    let (tx, rx) = channel::<Event>();
    let opts = escalation_opts(300, tmp.path().to_str().unwrap());
    let mut sup = Supervisor::start(opts, tx).expect("supervisor starts");
    let _ = wait_for_event(&rx, |e| matches!(e, Event::Spawn { .. }));
    std::thread::sleep(Duration::from_millis(150));
    let _ = drain(&rx);

    let t0 = std::time::Instant::now();
    sup.stop();
    sup.join();
    let stopped = wait_for_event(&rx, |e| matches!(e, Event::Stopped));
    assert!(stopped.is_some(), "Stopped must ship after the escalation");
    // the SIGTERM could not have killed this tree — the escalation window
    // (300ms) must have elapsed before the SIGKILL fallback
    assert!(
        t0.elapsed() >= Duration::from_millis(250),
        "stop must have waited the killTimeout before SIGKILL, took {:?}",
        t0.elapsed()
    );
}

#[test]
fn file_change_triggers_debounced_restart() {
    // covers the main loop's debounce-timeout branches: a real file change
    // → Change → Queued → (deadline elapses) → Debounced → Restart → Spawn
    let tmp = tempfile::tempdir().unwrap();
    let cwd = tmp.path().to_str().unwrap().to_string();
    let (tx, rx) = channel::<Event>();
    let opts = RuntimeOptions::build(
        None,
        vec![],
        cwd.clone(),
        Some("sleep 30".into()),
        vec![],
        vec![],
        vec![],
        vec![],
        None,
        None,
        None,
        None,
        Backend::Events,
        vec![],
        false,
    )
    .expect("valid opts");
    let mut sup = Supervisor::start(opts, tx).expect("supervisor starts");
    let _ = wait_for_event(&rx, |e| matches!(e, Event::Spawn { .. }));
    std::thread::sleep(Duration::from_millis(150));
    let _ = drain(&rx);

    // touch a watched file (default exts include js)
    std::fs::write(tmp.path().join("app.js"), "// change\n").unwrap();

    let change = wait_for_event(&rx, |e| matches!(e, Event::Change { .. }));
    assert!(change.is_some(), "Change event must ship for app.js");
    let queued = wait_for_event(&rx, |e| matches!(e, Event::Queued { .. }));
    assert!(queued.is_some(), "Queued event must ship (debounce armed)");
    let debounced = wait_for_event(&rx, |e| matches!(e, Event::Debounced));
    assert!(
        debounced.is_some(),
        "Debounced must fire when the deadline elapses"
    );
    let restart = wait_for_event(
        &rx,
        |e| matches!(e, Event::Restart { file: Some(f), .. } if f == "app.js"),
    );
    assert!(restart.is_some(), "Restart must blame app.js");
    let respawn = wait_for_event(&rx, |e| matches!(e, Event::Spawn { .. }));
    assert!(
        respawn.is_some(),
        "a respawn must follow the debounced restart"
    );
    sup.stop();
    sup.join();
}

/* --------------------- thread-spawn failure probe -----------------------
 * Same technique as the supervisor.rs unit-test probe, compiled into THIS
 * integration binary: it links the dependency flavor of nodeloop-core, a
 * separate instrumentation copy whose `Supervisor::start` error closure
 * needs its own trigger. Runs re-executed in an isolated child so the
 * transient RLIMIT_AS window cannot disturb the sibling tests.
 *----------------------------------------------------------------------- */
#[cfg(target_os = "linux")]
mod spawn_fail_probe {
    use super::*;

    #[repr(C)]
    struct RLimit {
        cur: u64,
        max: u64,
    }
    unsafe extern "C" {
        fn getrlimit(resource: i32, rlim: *mut RLimit) -> i32;
        fn setrlimit(resource: i32, rlim: *const RLimit) -> i32;
    }
    const RLIMIT_AS: i32 = 9;

    fn probe_body() {
        let statm = std::fs::read_to_string("/proc/self/statm").expect("statm readable");
        let virt_pages: u64 = statm
            .split_whitespace()
            .next()
            .expect("statm has the size field")
            .parse()
            .expect("statm size is numeric");
        let virt = virt_pages * 4096;
        unsafe {
            let mut old = RLimit { cur: 0, max: 0 };
            assert_eq!(getrlimit(RLIMIT_AS, &mut old), 0, "getrlimit works");
            let lim = RLimit {
                cur: virt + 512 * 1024,
                max: old.max,
            };
            assert_eq!(setrlimit(RLIMIT_AS, &lim), 0, "setrlimit lowers");
            let (tx, _rx) = channel::<Event>();
            let err = Supervisor::start(opts_with_exec(Some("sleep 30"), false), tx)
                .expect_err("thread spawn must fail under the address-space cap");
            assert_eq!(setrlimit(RLIMIT_AS, &old), 0, "restore rlimit first");
            match err {
                nodeloop_core::CoreError::Process(m) => assert!(
                    m.contains("failed to spawn supervisor thread"),
                    "wrong process error: {m}"
                ),
                other => panic!("expected CoreError::Process, got {other:?}"),
            }
        }
    }

    #[test]
    fn integration_supervisor_start_reports_thread_spawn_failure() {
        if std::env::var("NODELOOP_SPAWN_FAIL_PROBE").is_ok() {
            probe_body();
            std::process::exit(0);
        }
        let exe = std::env::current_exe().expect("test binary path");
        // bare substring filter (no --exact): libtest matches it against the
        // FULL test path — --exact with the leaf name would match nothing
        let out = std::process::Command::new(exe)
            .args([
                "integration_supervisor_start_reports_thread_spawn_failure",
                "--nocapture",
            ])
            .env("NODELOOP_SPAWN_FAIL_PROBE", "1")
            .output()
            .expect("re-exec probe child");
        assert!(
            out.status.success(),
            "probe child failed: {}",
            String::from_utf8_lossy(&out.stderr)
        );
    }
}
