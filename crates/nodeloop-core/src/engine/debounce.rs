//! Debounce engine — the exact port of the legacy `_debounceWait()`:
//! the wait is `delay`, capped by the time remaining until `maxWait` since
//! the burst's FIRST change, so an endless stream of writes can never
//! postpone a restart forever.

use std::time::Instant;

#[derive(Debug)]
pub struct Debouncer {
    delay_ms: u64,
    max_wait_ms: u64,
    burst_start: Option<Instant>,
}

impl Debouncer {
    pub fn new(delay_ms: u64, max_wait_ms: u64) -> Self {
        Self {
            delay_ms,
            max_wait_ms,
            burst_start: None,
        }
    }

    /// How long to wait after the latest change before restarting.
    /// Also opens/keeps the maxWait burst window.
    pub fn wait_for(&mut self, now: Instant) -> u64 {
        if self.max_wait_ms == 0 {
            return self.delay_ms;
        }
        let start = *self.burst_start.get_or_insert(now);
        let elapsed = now.duration_since(start).as_millis() as u64;
        self.delay_ms.min(self.max_wait_ms.saturating_sub(elapsed))
    }

    /// A restart completed — the burst window closes.
    pub fn reset_burst(&mut self) {
        self.burst_start = None;
    }

    /// Is a burst window open? (exposed for tests/diagnostics)
    pub fn bursting(&self) -> bool {
        self.burst_start.is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn plain_delay_when_max_wait_disabled() {
        let mut d = Debouncer::new(200, 0);
        let t0 = Instant::now();
        assert_eq!(d.wait_for(t0), 200);
        assert_eq!(d.wait_for(t0 + Duration::from_millis(500)), 200);
        assert!(!d.bursting());
    }

    #[test]
    fn burst_cap_never_starves_a_restart() {
        let mut d = Debouncer::new(200, 500);
        let t0 = Instant::now();
        // first change: full burst allowance, min(200, 500-0)
        assert_eq!(d.wait_for(t0), 200);
        // 400ms into the burst: only 100ms left before the cap
        assert_eq!(d.wait_for(t0 + Duration::from_millis(400)), 100);
        // 600ms in: cap reached → wait clamps to 0 → restart NOW
        assert_eq!(d.wait_for(t0 + Duration::from_millis(600)), 0);
        // reset closes the burst
        d.reset_burst();
        assert_eq!(d.wait_for(t0 + Duration::from_millis(601)), 200);
    }
}
