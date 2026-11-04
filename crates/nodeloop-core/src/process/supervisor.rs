//! The host-facing supervisor — hosts the run loop on a thread and exposes
//! the control surface the native bridge calls (start/stop/restart/stdin/
//! liveness). No business logic lives here: `engine::runtime::run` owns it.

use std::sync::mpsc::{Sender, channel};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

use crate::config::RuntimeOptions;
use crate::engine::runtime::run;
use crate::error::CoreError;
use crate::types::{Control, Event};

pub struct Supervisor {
    control_tx: Sender<Control>,
    child_alive: Arc<std::sync::atomic::AtomicBool>,
    stdin_slot: Arc<Mutex<Option<std::process::ChildStdin>>>,
    stopped: Arc<std::sync::atomic::AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

/// The supervisor thread's body — a named, `#[inline(never)]` function so
/// the spawned closure keeps its own distinct coverage record (a bare
/// tail-call closure gets merged into `run` by the compiler).
#[inline(never)]
fn supervisor_thread_main(
    opts: RuntimeOptions,
    events: Sender<Event>,
    control_rx: std::sync::mpsc::Receiver<Control>,
    child_alive: Arc<std::sync::atomic::AtomicBool>,
    stdin_slot: Arc<Mutex<Option<std::process::ChildStdin>>>,
    stopped: Arc<std::sync::atomic::AtomicBool>,
) {
    run(opts, events, control_rx, child_alive, stdin_slot, stopped);
}

impl Supervisor {
    /// Start the supervisor on its own thread.
    pub fn start(opts: RuntimeOptions, events: Sender<Event>) -> Result<Self, CoreError> {
        let (control_tx, control_rx) = channel();
        let stopped = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let child_alive = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let stdin_slot: Arc<Mutex<Option<std::process::ChildStdin>>> = Arc::new(Mutex::new(None));
        let thread_child_alive = Arc::clone(&child_alive);
        let thread_stdin_slot = Arc::clone(&stdin_slot);
        let thread_stopped = Arc::clone(&stopped);
        let thread = std::thread::Builder::new()
            .name("nodeloop-supervisor".into())
            .spawn(move || {
                supervisor_thread_main(
                    opts,
                    events,
                    control_rx,
                    thread_child_alive,
                    thread_stdin_slot,
                    thread_stopped,
                );
            })
            .map_err(|e| CoreError::Process(format!("failed to spawn supervisor thread: {e}")))?;
        Ok(Self {
            control_tx,
            child_alive,
            stdin_slot,
            stopped,
            thread: Some(thread),
        })
    }

    /// Manual restart (`rs` semantics): accounted as its own restart.
    pub fn restart_manual(&self) -> Result<(), CoreError> {
        if self.stopped.load(std::sync::atomic::Ordering::Relaxed) {
            return Err(CoreError::Stopped);
        }
        self.control_tx
            .send(Control::RestartManual)
            .map_err(|_| CoreError::Stopped)
    }

    /// Stop watching and kill the child; the run loop ends afterwards.
    pub fn stop(&self) {
        self.stopped
            .store(true, std::sync::atomic::Ordering::Relaxed);
        let _ = self.control_tx.send(Control::Stop);
    }

    /// Write a chunk into the current child's stdin (interactive mode).
    /// Returns false when no live child accepts input.
    pub fn write_stdin(&self, data: &[u8]) -> bool {
        if !self.child_alive.load(std::sync::atomic::Ordering::Relaxed) {
            return false;
        }
        let mut guard = self.stdin_slot.lock().unwrap();
        match guard.as_mut() {
            Some(stdin) => {
                use std::io::Write;
                match stdin.write_all(data).and_then(|_| stdin.flush()) {
                    Ok(()) => true,
                    Err(_) => {
                        // the pipe is gone — the child exited mid-write
                        guard.take();
                        self.child_alive
                            .store(false, std::sync::atomic::Ordering::Relaxed);
                        false
                    },
                }
            },
            None => false,
        }
    }

    /// Whether a live child exists right now.
    pub fn child_alive(&self) -> bool {
        self.child_alive.load(std::sync::atomic::Ordering::Relaxed)
    }

    /// Wait for the run loop to finish (already stopped or Stop sent).
    pub fn join(&mut self) {
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

impl std::fmt::Debug for Supervisor {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Supervisor")
            .field("child_alive", &self.child_alive())
            .field(
                "stopped",
                &self.stopped.load(std::sync::atomic::Ordering::Relaxed),
            )
            .finish()
    }
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;
    use crate::config::RuntimeOptions;
    use crate::types::Backend;

    fn opts(exec: &str) -> RuntimeOptions {
        RuntimeOptions::build(
            None,
            vec![],
            std::env::temp_dir().to_string_lossy().to_string(),
            Some(exec.to_string()),
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
        .expect("valid test opts")
    }

    #[test]
    fn supervisor_lifecycle_drives_every_public_method() {
        // the lib-test binary never runs the integration suite, so THIS
        // binary's copy of the Supervisor methods needs a full lifecycle
        // of its own: start → alive → stdin → restart → debug → stop → join
        let (tx, _rx) = std::sync::mpsc::channel::<Event>();
        let mut sup = Supervisor::start(opts("/usr/bin/sleep 30"), tx).expect("supervisor starts");
        // spawn is asynchronous — poll liveness instead of event order (the
        // full event flow is covered by the integration suite)
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        while !sup.child_alive() && std::time::Instant::now() < deadline {
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        assert!(sup.child_alive(), "child alive right after spawn");
        assert!(
            !sup.write_stdin(b"hi"),
            "non-interactive child must refuse stdin"
        );
        assert!(sup.restart_manual().is_ok(), "manual restart accepted");
        let dbg = format!("{sup:?}");
        assert!(dbg.starts_with("Supervisor"), "Debug shape: {dbg}");
        sup.stop();
        sup.join();
        assert!(
            sup.restart_manual().is_err(),
            "control after stop must be Err(Stopped)"
        );
    }

    #[test]
    fn interactive_supervisor_write_stdin_reaches_the_child() {
        // interactive=true pipes the child's stdin into stdin_slot — the
        // Some(stdin) arm of write_stdin (write_all → flush) only runs in
        // that mode; `cat` echoes whatever it receives
        let opts = RuntimeOptions::build(
            None,
            vec![],
            std::env::temp_dir().to_string_lossy().to_string(),
            Some("/bin/cat".to_string()),
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
            true,
        )
        .expect("valid interactive opts");
        let (tx, _rx) = std::sync::mpsc::channel::<Event>();
        let mut sup = Supervisor::start(opts, tx).expect("supervisor starts");
        // wait until the run loop populated stdin_slot (spawn is async)
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        while !sup.child_alive() && std::time::Instant::now() < deadline {
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        assert!(sup.child_alive(), "cat must be alive with piped stdin");
        assert!(
            sup.write_stdin(b"hello-stdin\n"),
            "write_stdin must accept the interactive child's stdin"
        );
        sup.stop();
        sup.join();
    }

    /* --------------------- thread-spawn failure probe ---------------------
     * `Supervisor::start`'s error branch (`.map_err(...)`) only runs when
     * the OS refuses the thread spawn. We force that deterministically by
     * capping NEW mmaps just above the process's current virtual size, so
     * the 2 MiB thread-stack mapping fails while small allocations still
     * fit. The probe re-executes THIS test binary in an isolated child
     * process so the transient RLIMIT_AS window can never disturb sibling
     * tests; the child's coverage counters merge back through the inherited
     * LLVM_PROFILE_FILE pattern.
     *--------------------------------------------------------------------- */
    #[repr(C)]
    struct RLimit {
        cur: u64,
        max: u64,
    }
    unsafe extern "C" {
        fn getrlimit(resource: i32, rlim: *mut RLimit) -> i32;
        fn setrlimit(resource: i32, rlim: *const RLimit) -> i32;
    }
    const RLIMIT_AS: i32 = 9; // Linux x86_64 address-space cap

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
            // headroom 512 KiB: small allocations survive, a 2 MiB stack mmap cannot
            let lim = RLimit {
                cur: virt + 512 * 1024,
                max: old.max,
            };
            assert_eq!(setrlimit(RLIMIT_AS, &lim), 0, "setrlimit lowers");
            let (tx, _rx) = std::sync::mpsc::channel::<Event>();
            let err = Supervisor::start(opts("/usr/bin/sleep 30"), tx)
                .expect_err("thread spawn must fail under the address-space cap");
            assert_eq!(setrlimit(RLIMIT_AS, &old), 0, "restore rlimit first");
            assert!(
                matches!(
                    err,
                    CoreError::Process(ref m) if m.contains("failed to spawn supervisor thread")
                ),
                "expected CoreError::Process, got {err:?}"
            );
        }
    }

    #[test]
    fn supervisor_start_reports_thread_spawn_failure() {
        if std::env::var("NODELOOP_SPAWN_FAIL_PROBE").is_ok() {
            probe_body();
            std::process::exit(0);
        }
        let exe = std::env::current_exe().expect("test binary path");
        // NOTE: a bare substring filter (no --exact) — libtest matches it
        // against the FULL test path; --exact with the leaf name would
        // match nothing and the child would silently run zero tests
        let out = std::process::Command::new(exe)
            .args([
                "supervisor_start_reports_thread_spawn_failure",
                "--nocapture",
            ])
            .env("NODELOOP_SPAWN_FAIL_PROBE", "1")
            .output()
            .expect("re-exec probe child");
        // Evaluate the diagnostics eagerly — the assert's format arguments
        // only execute on the panic path, and a lazy format arg on its own
        // line would count as an uncovered line in the coverage report.
        let stderr = String::from_utf8_lossy(&out.stderr);
        assert!(out.status.success(), "probe child failed: {stderr}");
    }
}
