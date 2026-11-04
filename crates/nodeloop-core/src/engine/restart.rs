//! Restart accounting — counters and the kill-in-flight queue, ported from
//! the legacy Watcher's `_killing` / `_pendingRestart` invariants:
//!
//! * a restart increments the counter and emits `Restart`;
//! * a change debounced DURING a kill-in-flight is counted, not dropped —
//!   it becomes its own `Restart` the moment the kill finishes;
//! * a manual restart (`rs`) blames no file.

#[derive(Debug, Default)]
pub struct RestartAccounting {
    restarts: u32,
    pending: bool,
}

impl RestartAccounting {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn restarts(&self) -> u32 {
        self.restarts
    }

    /// Register a restart (returns the new count).
    pub fn begin(&mut self) -> u32 {
        self.restarts += 1;
        self.restarts
    }

    /// A change was debounced while a kill was in flight.
    pub fn queue_pending(&mut self) {
        self.pending = true;
    }

    /// Consume the pending flag after the in-flight kill finished.
    /// Returns true when an EXTRA restart must be accounted.
    pub fn take_pending(&mut self) -> bool {
        std::mem::take(&mut self.pending)
    }

    pub fn is_pending(&self) -> bool {
        self.pending
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_and_pendings() {
        let mut a = RestartAccounting::new();
        assert_eq!(a.begin(), 1);
        assert_eq!(a.begin(), 2);
        assert!(!a.is_pending());
        a.queue_pending();
        assert!(a.is_pending());
        assert!(a.take_pending());
        assert!(!a.is_pending());
        assert!(!a.take_pending());
    }

    #[test]
    fn restarts_getter_reflects_begin_count() {
        // the host reads `restarts()` to label Restart banners; verify it
        // matches what begin() returned last
        let mut a = RestartAccounting::new();
        assert_eq!(a.restarts(), 0, "fresh accounting has zero restarts");
        assert_eq!(a.begin(), 1);
        assert_eq!(a.restarts(), 1);
        assert_eq!(a.begin(), 2);
        assert_eq!(a.begin(), 3);
        assert_eq!(a.restarts(), 3);
    }

    #[test]
    fn default_is_zeroed_like_new() {
        // Default::default() must equal new() — used by tests + hosts that
        // build the struct inline
        let via_new = RestartAccounting::new();
        let via_default = RestartAccounting::default();
        assert_eq!(via_new.restarts(), via_default.restarts());
        assert_eq!(via_new.is_pending(), via_default.is_pending());
    }

    #[test]
    fn queue_pending_is_idempotent_until_taken() {
        // multiple changes during a single kill-in-flight collapse into ONE
        // extra restart — the legacy invariant
        let mut a = RestartAccounting::new();
        a.queue_pending();
        a.queue_pending();
        a.queue_pending();
        assert!(a.is_pending());
        assert!(a.take_pending(), "first take consumes all queued");
        assert!(!a.take_pending(), "second take finds nothing");
    }
}
