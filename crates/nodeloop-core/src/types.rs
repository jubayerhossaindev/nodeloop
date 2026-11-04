//! Event and control types — the vocabulary of the supervisor.

use std::fmt;

/// One lifecycle event emitted by the supervisor. Serialization happens at
/// the bridge layer; the core never touches JSON.
#[derive(Debug, Clone, PartialEq)]
pub enum Event {
    /// A watched file changed (cwd-relative path).
    Change { file: String },
    /// The change was queued behind the debounce window.
    Queued { file: String, wait_ms: u64 },
    /// The debounce window elapsed — the restart fires now.
    Debounced,
    /// A restart begins (`file` is None for manual restarts).
    Restart { file: Option<String>, restarts: u32 },
    /// The live child is about to be killed (verbose detail).
    Stopping,
    /// A child was spawned (restarts = completed restart count).
    Spawn { restarts: u32 },
    /// spawn() itself failed (ENOENT, EACCES…) — no exit event follows.
    SpawnError {
        message: String,
        code: Option<String>,
        path: Option<String>,
    },
    /// The child exited on its own (not killed by us).
    Exit {
        code: Option<i32>,
        signal: Option<String>,
    },
    /// Real crash: own exit, non-zero code, no signal, supervisor alive.
    Crash { code: Option<i32> },
    /// Watcher-level failure (inotify limits, vanished root…).
    Error { message: String },
    /// The supervisor stopped (Stop control or fatal condition).
    Stopped,
}

impl fmt::Display for Event {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Event::Change { file } => write!(f, "change {file}"),
            Event::Queued { file, wait_ms } => write!(f, "queued {file} ({wait_ms}ms)"),
            Event::Debounced => write!(f, "debounced"),
            Event::Restart { file, restarts } => {
                write!(
                    f,
                    "restart #{restarts} ({})",
                    file.as_deref().unwrap_or("manual")
                )
            },
            Event::Stopping => write!(f, "stopping"),
            Event::Spawn { restarts } => write!(f, "spawn #{restarts}"),
            Event::SpawnError { message, .. } => write!(f, "spawn error: {message}"),
            Event::Exit { code, signal } => {
                write!(f, "exit code={code:?} signal={signal:?}")
            },
            Event::Crash { code } => write!(f, "crash code={code:?}"),
            Event::Error { message } => write!(f, "error: {message}"),
            Event::Stopped => write!(f, "stopped"),
        }
    }
}

/// Commands the host (bridge) can send a running supervisor.
#[derive(Debug, Clone, PartialEq)]
pub enum Control {
    /// Stop watching, kill the child, end the loop.
    Stop,
    /// Manual restart (`rs`) — accounted as its own restart, file = None.
    RestartManual,
}

/// Which watcher backend a supervisor should use.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Backend {
    /// Native fs events (inotify on Linux).
    Events,
    /// mtime+size polling with the given interval in ms (legacyWatch).
    Polling(u64),
}
