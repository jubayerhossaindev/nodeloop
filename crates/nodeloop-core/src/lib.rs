//! nodeloop-core — the performance-critical implementation shared by every
//! nodeloop front end (spec §8).
//!
//! Three responsibilities, each in its own module tree:
//!
//! * [`watcher`] — native file-system watching (inotify on Linux, an
//!   mtime+size polling fallback everywhere else — the `legacyWatch`
//!   trade-off), extension/ignore/watch-scope filtering, duplicate
//!   suppression.
//! * [`engine`] — debounce with the maxWait burst cap, restart scheduling
//!   and accounting, lifecycle event dispatch, graceful shutdown.
//! * [`process`] — command resolution (the exact `resolveSpawn` matrix),
//!   process spawning (own process group on POSIX), signal handling,
//!   kill timeout escalation, process-tree cleanup.
//!
//! The supervisor is the single source of lifecycle truth: the UI layer
//! only renders events this crate emits — never the other way around.

pub mod config;
pub mod engine;
pub mod error;
pub mod process;
pub mod types;
pub mod watcher;

pub use config::model::RuntimeOptions;
pub use error::CoreError;
pub use process::supervisor::Supervisor;
pub use types::Event;

/// The crate version, reported through the native bridge (`coreVersion()`).
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg(test)]
mod tests {
    #[test]
    fn version_matches_workspace() {
        assert_eq!(super::VERSION, "1.0.0");
    }
}
