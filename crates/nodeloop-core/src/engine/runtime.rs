//! The supervisor run loop — the single source of lifecycle truth.
//!
//! Threads:
//!   * watcher thread — polls the backend, sends `Change` events;
//!   * control forwarder — the host's Stop/RestartManual join the stream;
//!   * waiter thread (one per spawn) — owns the `Child`, `wait()`s and
//!     reports `ChildExit(code, signal)`;
//!   * main loop — debounce deadlines (recv_timeout), restart accounting,
//!     kill-in-flight queueing, crash detection.
//!
//! Faithful invariants (ported from the legacy JS Watcher):
//!   * change → queued → debounced → restart; the restart kills the OLD tree;
//!   * a change debounced DURING a kill-in-flight is counted, not dropped —
//!     it becomes its own `Restart` the moment the kill finishes, and the
//!     pending deadline is consumed (no double restart after respawn);
//!   * a `restart()` that arrives while a kill is in flight only sets the
//!     pending flag — no counter increment, no extra banner (legacy parity);
//!   * a crash = own exit + non-zero code + no signal + supervisor alive;
//!   * spawn failure = no exit event follows, the watcher stays alive and
//!     a later change revives the child;
//!   * debounce waits are capped by maxWait measured from the burst start.

use std::sync::mpsc::{Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::config::RuntimeOptions;
use crate::engine::debounce::Debouncer;
use crate::engine::events::LoopEvent;
use crate::engine::restart::RestartAccounting;
use crate::process::command::{SpawnedChild, resolve_spawn, spawn_child};
#[cfg(unix)]
use crate::process::signals::signal_name;
use crate::process::tree::kill_tree;
use crate::types::{Backend, Control, Event};

/// Everything the main loop mutates; the host observes parts of it.
pub(crate) struct RunState {
    pub(crate) opts: RuntimeOptions,
    pub(crate) events: Sender<Event>,
    pub(crate) tx: Sender<LoopEvent>,
    pub(crate) accounting: RestartAccounting,
    pub(crate) debouncer: Debouncer,
    pub(crate) deadline: Option<Instant>,
    pub(crate) last_change: Option<String>,
    pub(crate) expecting_kill: bool,
    pub(crate) pending_after_kill: bool,
    pub(crate) current_pid: Option<u32>,
    pub(crate) child_alive: Arc<std::sync::atomic::AtomicBool>,
    pub(crate) stdin_slot: Arc<Mutex<Option<std::process::ChildStdin>>>,
    pub(crate) stopped: Arc<std::sync::atomic::AtomicBool>,
}

/// Run the supervisor until a Stop control arrives (blocking — host it on
/// a thread, see [`crate::process::supervisor::Supervisor`]). The shared
/// state Arcs are created by the CALLER so the host can observe them.
pub fn run(
    opts: RuntimeOptions,
    events: Sender<Event>,
    control_rx: Receiver<Control>,
    child_alive: Arc<std::sync::atomic::AtomicBool>,
    stdin_slot: Arc<Mutex<Option<std::process::ChildStdin>>>,
    stopped: Arc<std::sync::atomic::AtomicBool>,
) {
    let (tx, rx) = std::sync::mpsc::channel::<LoopEvent>();

    /* -------------------------- watcher thread ------------------------- */
    {
        let tx = tx.clone();
        let stop = Arc::clone(&stopped);
        let backend = crate::watcher::build_backend(&opts);
        std::thread::spawn(move || watcher_poll_loop(backend, tx, stop));
    }

    /* ------------------------ control forwarder ------------------------ */
    {
        let tx = tx.clone();
        std::thread::spawn(move || forward_controls(control_rx, tx));
    }

    let mut state = RunState {
        opts,
        events,
        tx,
        accounting: RestartAccounting::new(),
        debouncer: Debouncer::new(200, 0),
        deadline: None,
        last_change: None,
        expecting_kill: false,
        pending_after_kill: false,
        current_pid: None,
        child_alive,
        stdin_slot,
        stopped: Arc::clone(&stopped),
    };
    state.debouncer = Debouncer::new(state.opts.delay_ms, state.opts.max_wait_ms);

    /* first boot — a spawn with restarts = 0 (drives the startup banner) */
    state.spawn(0);

    pump(&rx, &mut state);

    /* --------------------------- shutdown ------------------------------ */
    stopped.store(true, std::sync::atomic::Ordering::Relaxed);
    state.events.send(Event::Stopped).ok();
}

/// The watcher thread's body: poll the backend and forward every change to
/// the main loop until `stop` flips or the main loop goes away.
fn watcher_poll_loop(
    mut backend: Box<dyn crate::watcher::WatchBackend>,
    tx: Sender<LoopEvent>,
    stop: Arc<std::sync::atomic::AtomicBool>,
) {
    while !stop.load(std::sync::atomic::Ordering::Relaxed) {
        for file in backend.poll(100) {
            if tx.send(LoopEvent::Change(file)).is_err() {
                return; // main loop gone
            }
        }
    }
    backend.shutdown();
}

/// The control forwarder's body: relay host commands onto the loop channel
/// until the host drops its sender or the main loop goes away.
fn forward_controls(control_rx: Receiver<Control>, tx: Sender<LoopEvent>) {
    while let Ok(control) = control_rx.recv() {
        if tx.send(LoopEvent::Control(control)).is_err() {
            return; // main loop gone
        }
    }
}

/// The main loop: debounce deadlines (recv_timeout), restart accounting,
/// kill-in-flight queueing, crash detection. Exits on Stop or when every
/// `LoopEvent` sender has been dropped.
fn pump(rx: &Receiver<LoopEvent>, state: &mut RunState) {
    loop {
        let tick = Duration::from_millis(50);
        let timeout = match state.deadline {
            Some(d) => {
                let now = Instant::now();
                if d <= now {
                    Duration::ZERO
                } else {
                    (d - now).min(tick)
                }
            },
            None => tick,
        };

        match rx.recv_timeout(timeout) {
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                if let Some(d) = state.deadline
                    && Instant::now() >= d
                {
                    state.events.send(Event::Debounced).ok();
                    let file = state.last_change.clone();
                    state.restart(file);
                }
            },
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
            Ok(LoopEvent::Change(file)) => state.on_change(file),
            Ok(LoopEvent::ChildExit(code, signal)) => state.on_exit(code, signal),
            Ok(LoopEvent::Control(Control::RestartManual)) => {
                state.last_change = None; // manual restart — no file to blame
                state.restart(None);
            },
            Ok(LoopEvent::Control(Control::Stop)) => {
                state.on_stop();
                break;
            },
        }
    }
}

impl RunState {
    fn alive(&self) -> bool {
        self.child_alive.load(std::sync::atomic::Ordering::Relaxed)
    }

    fn is_stopped(&self) -> bool {
        self.stopped.load(std::sync::atomic::Ordering::Relaxed)
    }

    /// Test-only constructor: builds a RunState with the given options and
    /// the channels wired to the test's receivers. Tests use this to drive
    /// individual lifecycle methods without spawning the run loop's threads.
    #[cfg(test)]
    fn for_test(
        opts: RuntimeOptions,
        events: Sender<Event>,
        tx: Sender<LoopEvent>,
        child_alive: Arc<std::sync::atomic::AtomicBool>,
        stdin_slot: Arc<Mutex<Option<std::process::ChildStdin>>>,
        stopped: Arc<std::sync::atomic::AtomicBool>,
    ) -> Self {
        let debouncer = Debouncer::new(opts.delay_ms, opts.max_wait_ms);
        Self {
            opts,
            events,
            tx,
            accounting: RestartAccounting::new(),
            debouncer,
            deadline: None,
            last_change: None,
            expecting_kill: false,
            pending_after_kill: false,
            current_pid: None,
            child_alive,
            stdin_slot,
            stopped,
        }
    }

    fn on_change(&mut self, file: String) {
        if self.is_stopped() {
            return;
        }
        self.last_change = Some(file.clone());
        self.events.send(Event::Change { file: file.clone() }).ok();
        let wait = self.debouncer.wait_for(Instant::now());
        self.events
            .send(Event::Queued {
                file,
                wait_ms: wait,
            })
            .ok();
        self.deadline = Some(Instant::now() + Duration::from_millis(wait));
        if self.expecting_kill {
            // a change debounced DURING a kill-in-flight is counted, not dropped
            self.pending_after_kill = true;
        }
    }

    fn restart(&mut self, file: Option<String>) {
        if self.is_stopped() {
            return;
        }
        self.deadline = None; // clearTimeout(_debounceTimer) — legacy first move

        if self.expecting_kill {
            // kill already in flight: queue it, no counter, no banner
            self.pending_after_kill = true;
            return;
        }

        let restarts = self.accounting.begin();
        self.debouncer.reset_burst();
        self.events.send(Event::Restart { file, restarts }).ok();

        if let Some(pid) = self.current_pid.take()
            && self.alive()
        {
            self.expecting_kill = true;
            self.events.send(Event::Stopping).ok();
            kill_tree(pid, &self.opts.kill_signal);
            // tree-wide SIGKILL fallback if it hangs (killTimeout)
            let alive = Arc::clone(&self.child_alive);
            let timeout = self.opts.kill_timeout_ms;
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(timeout));
                if alive.load(std::sync::atomic::Ordering::Relaxed) {
                    kill_tree(pid, "SIGKILL");
                }
            });
            return; // respawn happens when the ChildExit arrives
        }
        // nothing alive (never started / crashed / exited / spawn failed)
        // → revive it. This IS a restart too — counted and announced above.
        self.spawn(restarts);
    }

    fn on_exit(&mut self, code: Option<i32>, signal: Option<String>) {
        self.current_pid = None;
        self.child_alive
            .store(false, std::sync::atomic::Ordering::Relaxed);
        self.stdin_slot.lock().unwrap().take(); // close the pipe

        if self.expecting_kill {
            self.expecting_kill = false;
            self.deadline = None; // the pending change was consumed below
            let mut restarts = self.accounting.restarts();
            if self.pending_after_kill {
                self.pending_after_kill = false;
                restarts = self.accounting.begin();
                self.events
                    .send(Event::Restart {
                        file: self.last_change.clone(),
                        restarts,
                    })
                    .ok();
            }
            self.spawn(restarts);
            return;
        }

        // own exit: announce it; a real crash keeps the watcher alive
        let is_crash =
            !self.is_stopped() && signal.is_none() && code.map(|c| c != 0).unwrap_or(false);
        self.events.send(Event::Exit { code, signal }).ok();
        if is_crash {
            self.events.send(Event::Crash { code }).ok();
        }
        // a later change revives the child via restart() (revive path)
    }

    fn on_stop(&mut self) {
        self.stopped
            .store(true, std::sync::atomic::Ordering::Relaxed);
        self.deadline = None;
        if let Some(pid) = self.current_pid.take()
            && self.alive()
        {
            kill_tree(pid, &self.opts.kill_signal);
            // bounded wait — the waiter thread clears liveness on exit
            let hard = Instant::now() + Duration::from_millis(self.opts.kill_timeout_ms);
            while self.alive() && Instant::now() < hard {
                std::thread::sleep(Duration::from_millis(10));
            }
            if self.alive() {
                kill_tree(pid, "SIGKILL");
            }
        }
        self.stdin_slot.lock().unwrap().take();
    }

    /// Resolve + spawn the command; emit Spawn or SpawnError.
    fn spawn(&mut self, restarts: u32) {
        if self.is_stopped() {
            return;
        }
        let spec = resolve_spawn(
            self.opts.exec.as_deref(),
            &self.opts.node_args,
            self.opts.script.as_deref(),
            &self.opts.script_args,
            std::env::consts::OS,
            &node_path(),
        );

        match spawn_child(
            &spec,
            &self.opts.cwd,
            &self.opts.env,
            self.opts.interactive_stdin,
        ) {
            Ok(SpawnedChild { pid, stdin, child }) => {
                if self.opts.interactive_stdin {
                    *self.stdin_slot.lock().unwrap() = stdin;
                }
                self.current_pid = Some(pid);
                self.child_alive
                    .store(true, std::sync::atomic::Ordering::Relaxed);
                self.events.send(Event::Spawn { restarts }).ok();

                // waiter thread: owns the Child, reports the real exit
                let tx = self.tx.clone();
                let alive = Arc::clone(&self.child_alive);
                std::thread::spawn(move || {
                    let mut child = child;
                    let (code, signal) = status_to_exit(child.wait());
                    alive.store(false, std::sync::atomic::Ordering::Relaxed);
                    let _ = tx.send(LoopEvent::ChildExit(code, signal));
                });
            },
            Err(err) => {
                self.child_alive
                    .store(false, std::sync::atomic::Ordering::Relaxed);
                // node-parity error shape: spawn <file> ENOENT / EACCES — the
                // JS humanizer keys on exactly this vocabulary
                let (code, message) = match err.kind() {
                    std::io::ErrorKind::NotFound => {
                        ("ENOENT".to_string(), format!("spawn {} ENOENT", spec.file))
                    },
                    std::io::ErrorKind::PermissionDenied => {
                        ("EACCES".to_string(), format!("spawn {} EACCES", spec.file))
                    },
                    other => (format!("{other:?}"), err.to_string()),
                };
                self.events
                    .send(Event::SpawnError {
                        message,
                        code: Some(code),
                        path: self.opts.script.clone(),
                    })
                    .ok();
                // no exit event follows a failed spawn; the watcher stays
                // alive and a later change revives it
            },
        }
    }
}

fn node_path() -> String {
    std::env::var("NODELOOP_NODE_PATH").unwrap_or_else(|_| "node".into())
}

/// Convert a `Child::wait()` result into the (code, signal-name) pair the
/// loop's ChildExit event carries. Extracted from the waiter thread so the
/// wait-failure and signal-exit paths are unit-testable with fabricated
/// statuses (the real waiter path is exercised end-to-end by the
/// supervisor integration tests).
fn status_to_exit(
    status: std::io::Result<std::process::ExitStatus>,
) -> (Option<i32>, Option<String>) {
    match status {
        Ok(status) => {
            let sig = {
                #[cfg(unix)]
                {
                    use std::os::unix::process::ExitStatusExt;
                    status.signal().and_then(signal_name)
                }
                #[cfg(not(unix))]
                {
                    let _ = status;
                    None
                }
            };
            (status.code(), sig)
        },
        Err(err) => (Some(-1), Some(err.to_string())),
    }
}

/// Silence the unused-variant warning on platforms without inotify.
#[allow(dead_code)]
fn _assert_backend_sendable() {
    fn is_send<T: Send>() {}
    is_send::<Backend>();
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::sync::Mutex;
    use std::sync::atomic::AtomicBool;
    use std::sync::mpsc::channel;

    /// Build a RunState wired to fresh channels + Arcs the test can read.
    /// `opts_for_test` produces a tiny RuntimeOptions pointing at a child
    /// that exits immediately, so spawn() doesn't leak long-lived processes.
    fn harness(
        opts: RuntimeOptions,
    ) -> (
        RunState,
        std::sync::mpsc::Receiver<Event>,
        std::sync::mpsc::Receiver<LoopEvent>,
        Arc<AtomicBool>,
        Arc<AtomicBool>,
    ) {
        let (event_tx, event_rx) = channel::<Event>();
        let (loop_tx, loop_rx) = channel::<LoopEvent>();
        let child_alive = Arc::new(AtomicBool::new(false));
        let stopped = Arc::new(AtomicBool::new(false));
        let stdin_slot: Arc<Mutex<Option<std::process::ChildStdin>>> = Arc::new(Mutex::new(None));
        let state = RunState::for_test(
            opts,
            event_tx,
            loop_tx,
            Arc::clone(&child_alive),
            stdin_slot,
            Arc::clone(&stopped),
        );
        (state, event_rx, loop_rx, child_alive, stopped)
    }

    fn opts_for_test(exec: Option<&str>) -> RuntimeOptions {
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
            false,
        )
        .expect("valid test opts")
    }

    #[test]
    fn alive_and_is_stopped_reflect_arcs() {
        // alive()/is_stopped() are pass-throughs to the shared atomic bools
        let (state, _ev, _loop, child_alive, stopped) = harness(opts_for_test(Some("true")));
        assert!(!state.alive());
        child_alive.store(true, std::sync::atomic::Ordering::Relaxed);
        assert!(state.alive());
        assert!(!state.is_stopped());
        stopped.store(true, std::sync::atomic::Ordering::Relaxed);
        assert!(state.is_stopped());
    }

    #[test]
    fn on_change_records_last_change_and_sets_deadline() {
        let (mut state, ev, _loop, _ca, _stop) = harness(opts_for_test(Some("true")));
        state.on_change("app.js".into());
        // Change + Queued events both ship; last_change + deadline are set
        assert_eq!(state.last_change.as_deref(), Some("app.js"));
        assert!(state.deadline.is_some());
        // drain events: first Change, then Queued
        let mut got = Vec::new();
        while let Ok(e) = ev.try_recv() {
            got.push(e);
        }
        assert!(got.iter().any(|e| matches!(
            e,
            Event::Change { file } if file == "app.js"
        )));
        assert!(got.iter().any(|e| matches!(
            e,
            Event::Queued { file, wait_ms: _ } if file == "app.js"
        )));
    }

    #[test]
    fn on_change_is_noop_when_stopped() {
        // the run loop may still be draining its queue when Stop arrives —
        // a late Change must NOT arm a new deadline or push events
        let (mut state, ev, _loop, _ca, stopped) = harness(opts_for_test(Some("true")));
        stopped.store(true, std::sync::atomic::Ordering::Relaxed);
        state.on_change("late.js".into());
        assert!(state.last_change.is_none());
        assert!(state.deadline.is_none());
        assert!(ev.try_recv().is_err(), "no events should ship after Stop");
    }

    #[test]
    fn on_change_during_kill_in_flight_queues_pending() {
        // the legacy invariant: a change during a kill is counted, not dropped
        let (mut state, _ev, _loop, _ca, _stop) = harness(opts_for_test(Some("true")));
        state.expecting_kill = true;
        state.on_change("during-kill.js".into());
        assert!(
            state.pending_after_kill,
            "change during kill must set pending_after_kill"
        );
    }

    #[test]
    fn restart_when_stopped_is_noop() {
        let (mut state, ev, _loop, _ca, stopped) = harness(opts_for_test(Some("true")));
        stopped.store(true, std::sync::atomic::Ordering::Relaxed);
        state.restart(Some("late.js".into()));
        assert!(ev.try_recv().is_err(), "no Restart event after Stop");
    }

    #[test]
    fn restart_queues_when_kill_in_flight_no_counter_bump() {
        // a manual restart while a kill is already running only sets the
        // pending flag — NO Restart banner, NO counter increment (legacy parity)
        let (mut state, ev, _loop, _ca, _stop) = harness(opts_for_test(Some("true")));
        state.expecting_kill = true;
        let before = state.accounting.restarts();
        state.restart(Some("during.js".into()));
        assert_eq!(
            state.accounting.restarts(),
            before,
            "counter must NOT advance for a queued restart"
        );
        assert!(state.pending_after_kill);
        assert!(ev.try_recv().is_err(), "no Restart banner during kill");
    }

    #[test]
    fn restart_revives_when_no_child_alive() {
        // no current_pid → spawn immediately. Use `true` so the child exits
        // at once; we only assert the Restart banner ships + accounting bumps.
        let (mut state, ev, _loop, _ca, _stop) = harness(opts_for_test(Some("true")));
        state.restart(Some("revive.js".into()));
        // first event must be Restart; Spawn follows from spawn()
        let first = ev.recv_timeout(std::time::Duration::from_secs(2)).unwrap();
        assert!(matches!(first, Event::Restart { restarts: 1, .. }));
        assert!(!matches!(first, Event::Spawn { .. }));
        assert_eq!(state.accounting.restarts(), 1);
        // drain the Spawn event so the waiter thread can finish
        while ev
            .recv_timeout(std::time::Duration::from_millis(200))
            .is_ok()
        {}
    }

    #[test]
    fn on_exit_clears_pid_and_marks_child_dead() {
        let (mut state, ev, _loop, child_alive, _stop) = harness(opts_for_test(Some("true")));
        // pretend a child is alive
        state.current_pid = Some(42);
        child_alive.store(true, std::sync::atomic::Ordering::Relaxed);
        state.on_exit(Some(0), None);
        assert!(state.current_pid.is_none());
        assert!(!child_alive.load(std::sync::atomic::Ordering::Relaxed));
        // Exit event ships; no Crash because exit code is 0
        let mut got = Vec::new();
        while let Ok(e) = ev.try_recv() {
            got.push(e);
        }
        assert!(got.iter().any(|e| matches!(
            e,
            Event::Exit {
                code: Some(0),
                signal: None
            }
        )));
        assert!(!got.iter().any(|e| matches!(e, Event::Crash { .. })));
    }

    #[test]
    fn on_exit_nonzero_code_with_no_signal_is_a_crash() {
        // crash = own exit + non-zero code + no signal + supervisor alive
        let (mut state, ev, _loop, _ca, _stop) = harness(opts_for_test(Some("true")));
        state.on_exit(Some(1), None);
        let mut got = Vec::new();
        while let Ok(e) = ev.try_recv() {
            got.push(e);
        }
        assert!(got.iter().any(|e| matches!(
            e,
            Event::Exit {
                code: Some(1),
                signal: None
            }
        )));
        assert!(
            got.iter()
                .any(|e| matches!(e, Event::Crash { code: Some(1) }))
        );
    }

    #[test]
    fn on_exit_with_signal_is_not_a_crash() {
        // a signal kill (SIGTERM from outside) is NOT a crash — legacy parity
        let (mut state, ev, _loop, _ca, _stop) = harness(opts_for_test(Some("true")));
        state.on_exit(Some(143), Some("SIGTERM".into()));
        let mut got = Vec::new();
        while let Ok(e) = ev.try_recv() {
            got.push(e);
        }
        assert!(got.iter().any(|e| matches!(
            e,
            Event::Exit {
                code: Some(143),
                signal: Some(_)
            }
        )));
        assert!(!got.iter().any(|e| matches!(e, Event::Crash { .. })));
    }

    #[test]
    fn on_exit_after_kill_consumes_pending_and_respawns() {
        // the in-flight kill finished; a change queued during it becomes its
        // own restart (counter advances, banner ships, spawn happens)
        let (mut state, ev, _loop, _ca, _stop) = harness(opts_for_test(Some("true")));
        state.expecting_kill = true;
        state.pending_after_kill = true;
        state.last_change = Some("during.js".into());
        state.on_exit(Some(0), None);
        // we expect: Exit (suppressed because expecting_kill? NO — Exit is
        // suppressed ONLY when expecting_kill; verify) → Restart → Spawn
        let first = ev.recv_timeout(std::time::Duration::from_secs(2)).unwrap();
        // expecting_kill short-circuits the Exit/Crash path
        assert!(
            matches!(first, Event::Restart { restarts: 1, .. }),
            "expected Restart after kill, got {first:?}"
        );
        assert!(!matches!(first, Event::Spawn { .. }));
        // drain remaining events
        while ev
            .recv_timeout(std::time::Duration::from_millis(200))
            .is_ok()
        {}
        assert!(!state.expecting_kill);
        assert!(!state.pending_after_kill);
    }

    #[test]
    fn on_stop_kills_alive_child_and_clears_state() {
        // on_stop with a dead pid: alive() == false → no kill attempt, just clear
        let (mut state, _ev, _loop, child_alive, _stop) = harness(opts_for_test(Some("true")));
        state.current_pid = Some(999_999); // bogus pid, alive=false
        child_alive.store(false, std::sync::atomic::Ordering::Relaxed);
        state.on_stop();
        assert!(state.current_pid.is_none());
        assert!(state.deadline.is_none());
        assert!(state.is_stopped());
    }

    #[test]
    fn on_stop_sigkill_escalation_when_child_stays_alive() {
        // live child + short kill_timeout → bounded wait expires → SIGKILL
        // escalation branch (alive() still true after the wait)
        let opts = RuntimeOptions::build(
            None,
            vec![],
            std::env::temp_dir().to_string_lossy().to_string(),
            Some("true".into()),
            vec![],
            vec![],
            vec![],
            vec![],
            None,
            None,
            None,
            Some(5), // kill_timeout_ms — keep the wait short
            Backend::Events,
            vec![],
            false,
        )
        .expect("valid opts");
        let (mut state, _ev, _loop, child_alive, _stop) = harness(opts);
        state.current_pid = Some(999_999); // bogus pid
        child_alive.store(true, std::sync::atomic::Ordering::Relaxed);
        state.on_stop();
        assert!(state.current_pid.is_none());
        assert!(state.deadline.is_none());
        assert!(state.is_stopped());
        // the escalation thread may still be running; give it a moment then
        // silence it so it doesn't fire SIGKILL on a recycled pid
        std::thread::sleep(std::time::Duration::from_millis(50));
        child_alive.store(false, std::sync::atomic::Ordering::Relaxed);
    }

    #[test]
    fn spawn_with_interactive_stdin_stores_stdin_slot() {
        // interactive_stdin=true → the piped stdin is captured in the slot
        let opts = RuntimeOptions::build(
            None,
            vec![],
            std::env::temp_dir().to_string_lossy().to_string(),
            Some("true".into()),
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
        let (mut state, ev, _loop, _ca, _stop) = harness(opts);
        state.spawn(0);
        let first = ev.recv_timeout(Duration::from_secs(2)).unwrap();
        assert!(matches!(first, Event::Spawn { restarts: 0 }));
        assert!(!matches!(first, Event::Restart { .. }));
        assert!(state.stdin_slot.lock().unwrap().is_some());
        drop(state);
        drop(ev);
    }

    #[test]
    fn spawn_failure_emits_spawn_error_event() {
        // a bogus exec path → spawn() returns ENOENT → SpawnError event
        let (mut state, ev, _loop, _ca, _stop) =
            harness(opts_for_test(Some("/nonexistent-binary-xyz-123")));
        state.spawn(0);
        let mut got = Vec::new();
        while let Ok(e) = ev.try_recv() {
            got.push(e);
        }
        // no Spawn event ships; a SpawnError carries the ENOENT code
        assert!(!got.iter().any(|e| matches!(e, Event::Spawn { .. })));
        assert!(got.iter().any(|e| matches!(
            e,
            Event::SpawnError { code: Some(c), .. } if c == "ENOENT"
        )));
    }

    #[test]
    fn spawn_failure_eacces_when_exec_not_executable() {
        // a file that EXISTS but isn't executable → spawn() returns
        // PermissionDenied → SpawnError carries the EACCES code (legacy parity)
        let tmp = tempfile::tempdir().unwrap();
        let non_exec = tmp.path().join("not-executable.sh");
        std::fs::write(&non_exec, "#!/bin/sh\n").unwrap();
        // explicitly NOT chmod +x — the file exists but lacks execute permission
        // → spawn returns EACCES on POSIX
        let opts = RuntimeOptions::build(
            None,
            vec![],
            std::env::temp_dir().to_string_lossy().to_string(),
            Some(non_exec.to_string_lossy().to_string()),
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
        let (mut state, ev, _loop, _ca, _stop) = harness(opts);
        state.spawn(0);
        let texts: Vec<String> = ev.try_iter().map(|e| e.to_string()).collect();
        assert!(
            !texts.iter().any(|t| t.starts_with("spawn #")),
            "no Spawn banner may ship, got {texts:?}"
        );
        let err_text = texts
            .iter()
            .find(|t| t.starts_with("spawn error:"))
            .expect("a SpawnError must ship for a non-executable file");
        // On Linux + tmpfs the spawn of a non-executable file yields
        // EACCES. On some sandbox filesystems it may surface as another
        // errno — but it MUST NOT be ENOENT (the file exists).
        assert!(
            !err_text.contains("ENOENT"),
            "file exists — must not be ENOENT: {err_text}"
        );
    }

    #[test]
    fn spawn_when_stopped_is_noop() {
        let (mut state, ev, _loop, _ca, stopped) = harness(opts_for_test(Some("true")));
        stopped.store(true, std::sync::atomic::Ordering::Relaxed);
        state.spawn(0);
        assert!(ev.try_recv().is_err(), "no Spawn event after Stop");
    }

    #[test]
    fn spawn_success_emits_spawn_event_and_sets_alive() {
        // exec="true" → child spawns, exits 0, waiter thread reaps
        let (mut state, ev, _loop, child_alive, _stop) = harness(opts_for_test(Some("true")));
        state.spawn(0);
        let first = ev.recv_timeout(std::time::Duration::from_secs(2)).unwrap();
        assert!(matches!(first, Event::Spawn { restarts: 0 }));
        assert!(!matches!(first, Event::Restart { .. }));
        assert!(child_alive.load(std::sync::atomic::Ordering::Relaxed));
        // NOTE: the child-exit event travels through the INTERNAL LoopEvent
        // channel (state.tx → pump), not `ev` — in this unit-test harness no
        // pump() runs, so `ev` intentionally stays quiet after the Spawn
        // event. Dropping `state` below releases the waiter thread.
        drop(state);
        drop(ev);
    }

    #[test]
    fn node_path_respects_env_override() {
        // NODELOOP_NODE_PATH env var swaps the node binary used by spawn().
        // verify the helper picks it up — the integration test exercises the
        // actual spawn path.
        unsafe {
            std::env::set_var("NODELOOP_NODE_PATH", "/custom/node");
        }
        assert_eq!(node_path(), "/custom/node");
        unsafe {
            std::env::remove_var("NODELOOP_NODE_PATH");
        }
        // without the override, falls back to "node"
        assert_eq!(node_path(), "node");
    }

    #[test]
    fn backend_sendable_assertion_compiles() {
        // _assert_backend_sendable exists to silence an unused-variant
        // warning on platforms without inotify — invoke it so it isn't
        // stripped as dead code by coverage tooling
        _assert_backend_sendable();
    }

    #[test]
    fn status_to_exit_maps_clean_exit() {
        // a normal exit: code preserved, no signal
        let status = std::process::Command::new("true").status().unwrap();
        let (code, signal) = status_to_exit(Ok(status));
        assert_eq!(code, Some(0));
        assert_eq!(signal, None);
    }

    #[test]
    fn status_to_exit_maps_signal_exit() {
        // a SIGTERM-killed child: code is None, signal name resolved.
        // Fabricate the raw wait status so no real process is killed here:
        // raw 0x000F = terminated by signal 15 (SIGTERM) on Unix.
        #[cfg(unix)]
        {
            use std::os::unix::process::ExitStatusExt;
            let status = std::process::ExitStatus::from_raw(0x000F);
            let (code, signal) = status_to_exit(Ok(status));
            assert_eq!(code, None);
            assert_eq!(signal.as_deref(), Some("SIGTERM"));
        }
    }

    #[test]
    fn status_to_exit_maps_wait_failure() {
        // child.wait() itself failed (ECHILD after an external reap, …):
        // the waiter reports code=-1 + the error string — the loop treats
        // it like an exit, never a panic
        let err = Err(std::io::Error::from_raw_os_error(libc::ECHILD));
        let (code, signal) = status_to_exit(err);
        assert_eq!(code, Some(-1));
        assert!(signal.is_some());
    }

    /// A deterministic WatchBackend for driving watcher_poll_loop without
    /// real filesystem timing: returns the scripted changes and can flip
    /// the stop flag from inside poll().
    struct ScriptedBackend {
        changes: Vec<Vec<String>>,
        call: std::sync::atomic::AtomicUsize,
        stop: Option<Arc<AtomicBool>>,
    }
    impl ScriptedBackend {
        fn new(changes: Vec<Vec<String>>) -> Self {
            Self {
                changes,
                call: std::sync::atomic::AtomicUsize::new(0),
                stop: None,
            }
        }
        fn with_stop_flag(mut self, stop: Arc<AtomicBool>) -> Self {
            self.stop = Some(stop);
            self
        }
    }
    impl crate::watcher::WatchBackend for ScriptedBackend {
        fn poll(&mut self, _timeout_ms: u64) -> Vec<String> {
            let n = self.call.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            if let Some(stop) = &self.stop
                && n >= 1
            {
                stop.store(true, std::sync::atomic::Ordering::Relaxed);
            }
            self.changes.get(n).cloned().unwrap_or_default()
        }
        fn shutdown(&mut self) {}
    }

    #[test]
    fn watcher_poll_loop_returns_when_stop_flag_set() {
        // stop=true before the first poll → the loop body never runs and
        // the backend is shut down cleanly
        let (tx, _rx) = channel::<LoopEvent>();
        let stop = Arc::new(AtomicBool::new(true));
        let backend = Box::new(ScriptedBackend::new(vec![]));
        watcher_poll_loop(backend, tx, stop); // must return promptly
    }

    #[test]
    fn watcher_poll_loop_forwards_changes_then_stops() {
        // a live receiver: the reported change is delivered, then the
        // backend's stop flag flips inside the second poll and the loop
        // exits through the shutdown path
        let (tx, rx) = channel::<LoopEvent>();
        let stop = Arc::new(AtomicBool::new(false));
        let backend = Box::new(
            ScriptedBackend::new(vec![vec!["app.js".into()]]).with_stop_flag(Arc::clone(&stop)),
        );
        watcher_poll_loop(backend, tx, Arc::clone(&stop));
        assert!(matches!(
            rx.recv().unwrap(),
            LoopEvent::Change(f) if f == "app.js"
        ));
        assert!(stop.load(std::sync::atomic::Ordering::Relaxed));
    }

    #[test]
    fn watcher_poll_loop_returns_when_main_loop_gone() {
        // the receiver is dropped: the first reported change hits a dead
        // channel → the poll loop exits instead of spinning forever
        let (tx, rx) = channel::<LoopEvent>();
        drop(rx); // main loop gone
        let stop = Arc::new(AtomicBool::new(false));
        let backend = Box::new(ScriptedBackend::new(vec![vec!["app.js".into()]]));
        watcher_poll_loop(backend, tx, stop); // must return on the dead send
    }

    #[test]
    fn forward_controls_relays_until_host_drops_sender() {
        // happy path: controls relayed in order; ends when the host closes
        let (ctx, crx) = channel::<Control>();
        let (ltx, lrx) = channel::<LoopEvent>();
        ctx.send(Control::RestartManual).unwrap();
        ctx.send(Control::Stop).unwrap();
        drop(ctx);
        forward_controls(crx, ltx);
        let first = lrx.recv().unwrap();
        assert!(matches!(first, LoopEvent::Control(Control::RestartManual)));
        assert!(!matches!(first, LoopEvent::Control(Control::Stop)));
        let second = lrx.recv().unwrap();
        assert!(matches!(second, LoopEvent::Control(Control::Stop)));
        assert!(!matches!(
            second,
            LoopEvent::Control(Control::RestartManual)
        ));
        assert!(lrx.recv().is_err(), "channel closed after forwarder ends");
    }

    #[test]
    fn forward_controls_returns_when_main_loop_gone() {
        // the loop receiver is dropped while a control is queued: the
        // forwarder must exit rather than block forever
        let (ctx, crx) = channel::<Control>();
        let (ltx, lrx) = channel::<LoopEvent>();
        drop(lrx);
        ctx.send(Control::RestartManual).unwrap();
        drop(ctx);
        forward_controls(crx, ltx); // must return
    }

    #[test]
    fn pump_exits_when_all_loop_senders_drop() {
        // every sender dropped before the first tick → recv_timeout yields
        // Disconnected → pump breaks out immediately
        let (mut state, _ev, loop_rx, _ca, _stop) = harness(opts_for_test(None));
        // swap out the state's sender for one whose receiver is already
        // dropped, and DROP the old sender — the channel becomes fully
        // disconnected
        let (dead_tx, dead_rx) = channel::<LoopEvent>();
        drop(dead_rx);
        drop(std::mem::replace(&mut state.tx, dead_tx));
        pump(&loop_rx, &mut state); // returns via the Disconnected arm
    }

    #[test]
    fn pump_fires_zero_deadline_immediately() {
        // covers the `Duration::ZERO` branch: a deadline already in the
        // past (a maxWait-capped burst collapses the wait to 0) must fire
        // the debounce on the very next iteration, then a Stop control
        // ends the loop cleanly.
        let (mut state, ev, loop_rx, _ca, _stop) = harness(opts_for_test(Some("true")));
        // keep a second sender so we can inject the Stop AFTER the fire
        let stop_tx = state.tx.clone();
        state.last_change = Some("burst.js".into());
        state.deadline = Some(Instant::now() - Duration::from_millis(1)); // expired

        std::thread::spawn(move || {
            // give the pump a moment to fire the debounce, then stop it
            std::thread::sleep(Duration::from_millis(200));
            let _ = stop_tx.send(LoopEvent::Control(Control::Stop));
        });

        pump(&loop_rx, &mut state); // returns after the Stop control

        let mut got = Vec::new();
        while let Ok(e) = ev.try_recv() {
            got.push(e);
        }
        assert!(got.iter().any(|e| matches!(e, Event::Debounced)));
        assert!(got.iter().any(|e| matches!(e, Event::Restart { .. })));
        assert!(state.is_stopped(), "on_stop ran via the Stop control");
    }

    #[test]
    fn restart_with_dead_pid_revives_child() {
        // current_pid set but child DEAD → the alive check fails → the
        // kill path is skipped and restart() falls through to a direct
        // revive spawn (crash-then-change recovery)
        let (mut state, ev, _loop, child_alive, _stop) = harness(opts_for_test(Some("true")));
        state.current_pid = Some(9_999_998); // pid known, but dead
        child_alive.store(false, std::sync::atomic::Ordering::Relaxed);

        state.restart(Some("revive.js".into()));

        assert!(!state.expecting_kill, "no kill was in flight");
        let first = ev.recv_timeout(Duration::from_secs(2)).unwrap();
        assert!(matches!(first, Event::Restart { restarts: 1, .. }));
        assert!(!matches!(first, Event::Spawn { .. }));
        assert_eq!(state.accounting.restarts(), 1);
        // drain the Spawn + ChildExit chain from the revive spawn
        while ev.recv_timeout(Duration::from_millis(300)).is_ok() {}
    }

    #[test]
    fn restart_with_live_fake_pid_kills_and_defers_respawn() {
        // current_pid set + child alive → restart() takes the kill path:
        // Restart banner → Stopping → kill_tree (bogus pid: safe no-op) →
        // SIGKILL escalation thread armed (killTimeout=50ms) → return
        // WITHOUT respawning (the respawn waits for ChildExit).
        let opts = RuntimeOptions::build(
            None,
            vec![],
            std::env::temp_dir().to_string_lossy().to_string(),
            Some("true".into()),
            vec![],
            vec![],
            vec![],
            vec![],
            None,
            None,
            None,
            Some(50), // kill_timeout_ms — keep the escalation thread short
            Backend::Events,
            vec![],
            false,
        )
        .expect("valid opts");
        let (mut state, ev, _loop, child_alive, _stop) = harness(opts);
        state.current_pid = Some(9_999_999); // no real process behind it
        child_alive.store(true, std::sync::atomic::Ordering::Relaxed);

        state.restart(Some("killed.js".into()));

        assert!(state.expecting_kill, "kill must be in flight");
        assert!(state.current_pid.is_none(), "pid taken for the kill");
        assert_eq!(state.accounting.restarts(), 1, "restart counted");
        let mut got = Vec::new();
        while let Ok(e) = ev.try_recv() {
            got.push(e);
        }
        assert!(
            got.iter()
                .any(|e| matches!(e, Event::Restart { restarts: 1, .. }))
        );
        assert!(got.iter().any(|e| matches!(e, Event::Stopping)));
        assert!(!got.iter().any(|e| matches!(e, Event::Spawn { .. })));
        // let the 50ms escalation thread finish, then silence it
        child_alive.store(false, std::sync::atomic::Ordering::Relaxed);
        std::thread::sleep(std::time::Duration::from_millis(120));
    }

    #[test]
    fn spawn_error_other_kind_reported_verbatim() {
        // cwd is a REGULAR FILE → spawn fails with ENOTDIR, which maps to
        // neither NotFound nor PermissionDenied → the `other` arm reports
        // the io ErrorKind name verbatim (legacy parity: any spawn failure
        // surfaces as SpawnError with its code)
        let tmp = tempfile::tempdir().unwrap();
        let file_cwd = tmp.path().join("not-a-dir");
        std::fs::write(&file_cwd, "x").unwrap();
        let opts = RuntimeOptions::build(
            None,
            vec![],
            file_cwd.to_string_lossy().to_string(),
            Some("true".into()),
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
        .expect("opts validate (cwd non-empty)");
        let (mut state, ev, _loop, _ca, _stop) = harness(opts);
        state.spawn(0);
        let texts: Vec<String> = ev.try_iter().map(|e| e.to_string()).collect();
        assert!(
            !texts.iter().any(|t| t.starts_with("spawn #")),
            "no Spawn banner may ship, got {texts:?}"
        );
        let err_text = texts
            .iter()
            .find(|t| t.starts_with("spawn error:"))
            .expect("SpawnError must ship for a bad cwd");
        assert!(
            !err_text.contains("ENOENT") && !err_text.contains("EACCES"),
            "unexpected code in {err_text} — expected the `other` ErrorKind arm"
        );
    }
}
