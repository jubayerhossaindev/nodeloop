//! Core error type.

use std::fmt;

/// Everything that can go wrong inside the core. The bridge converts these
/// into the host language's errors; nothing here panics by contract.
#[derive(Debug)]
pub enum CoreError {
    /// The runtime options failed validation.
    InvalidOptions(String),
    /// A filesystem/watcher failure (inotify limits, missing root…).
    Watcher(String),
    /// A process operation failed.
    Process(String),
    /// The supervisor was used after it stopped.
    Stopped,
}

impl fmt::Display for CoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CoreError::InvalidOptions(m) => write!(f, "invalid options: {m}"),
            CoreError::Watcher(m) => write!(f, "watcher: {m}"),
            CoreError::Process(m) => write!(f, "process: {m}"),
            CoreError::Stopped => write!(f, "supervisor stopped"),
        }
    }
}

impl std::error::Error for CoreError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_covers_every_variant() {
        // the bridge turns CoreError into host-language strings via Display
        // (`e.to_string()`) — every variant's exact wording is contract
        assert_eq!(
            CoreError::InvalidOptions("delay must be > 0".into()).to_string(),
            "invalid options: delay must be > 0"
        );
        assert_eq!(
            CoreError::Watcher("inotify limit reached".into()).to_string(),
            "watcher: inotify limit reached"
        );
        assert_eq!(
            CoreError::Process("spawn failed".into()).to_string(),
            "process: spawn failed"
        );
        assert_eq!(CoreError::Stopped.to_string(), "supervisor stopped");
    }
}
