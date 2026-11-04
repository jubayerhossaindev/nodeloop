//! Signal handling — name parsing and delivery constants. On Unix the
//! numbers come straight from `libc` so they are always correct for the
//! target OS; on Windows the tree is killed with taskkill /F
//! (TerminateProcess), where graceful killSignal semantics do not exist —
//! the same trade-off nodemon makes.

/// Parse a signal NAME (SIGTERM/term) into the libc number on Unix.
#[cfg(unix)]
pub fn signal_number(name: &str) -> Option<i32> {
    let upper = name.trim().to_uppercase();
    let canonical = if upper.starts_with("SIG") {
        upper.clone()
    } else {
        format!("SIG{upper}")
    };
    match canonical.as_str() {
        "SIGHUP" => Some(libc::SIGHUP),
        "SIGINT" => Some(libc::SIGINT),
        "SIGQUIT" => Some(libc::SIGQUIT),
        "SIGABRT" => Some(libc::SIGABRT),
        "SIGKILL" => Some(libc::SIGKILL),
        "SIGTERM" => Some(libc::SIGTERM),
        "SIGUSR1" => Some(libc::SIGUSR1),
        "SIGUSR2" => Some(libc::SIGUSR2),
        "SIGSTOP" => Some(libc::SIGSTOP),
        "SIGCONT" => Some(libc::SIGCONT),
        _ => raw_number(&upper),
    }
}

/// Numeric strings ("15") pass through as-is.
#[cfg(unix)]
fn raw_number(upper: &str) -> Option<i32> {
    if upper.chars().all(|c| c.is_ascii_digit()) && !upper.is_empty() {
        upper.parse::<i32>().ok()
    } else {
        None
    }
}

/// Reverse map for reporting: libc signal number → canonical name.
#[cfg(unix)]
pub fn signal_name(num: i32) -> Option<String> {
    match num {
        x if x == libc::SIGHUP => Some("SIGHUP".into()),
        x if x == libc::SIGINT => Some("SIGINT".into()),
        x if x == libc::SIGQUIT => Some("SIGQUIT".into()),
        x if x == libc::SIGABRT => Some("SIGABRT".into()),
        x if x == libc::SIGKILL => Some("SIGKILL".into()),
        x if x == libc::SIGTERM => Some("SIGTERM".into()),
        x if x == libc::SIGUSR1 => Some("SIGUSR1".into()),
        x if x == libc::SIGUSR2 => Some("SIGUSR2".into()),
        _ => Some(format!("SIG{num}")),
    }
}

#[cfg(unix)]
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_common_names() {
        assert_eq!(signal_number("SIGTERM"), Some(libc::SIGTERM));
        assert_eq!(signal_number("term"), Some(libc::SIGTERM));
        assert_eq!(signal_number(" SIGINT "), Some(libc::SIGINT));
        assert_eq!(signal_number("9"), Some(9));
        assert_eq!(signal_number("NOTASIGNAL"), None);
        assert_eq!(signal_number("SIG"), None);
        assert_eq!(signal_number("123abc"), None);
        // empty string: starts_with("SIG") is false → canonical = "SIG" →
        // falls to raw_number("") where all()=true (vacuous) but is_empty()=false
        assert_eq!(signal_number(""), None);
    }

    #[test]
    fn names_round_trip() {
        assert_eq!(signal_name(libc::SIGTERM).as_deref(), Some("SIGTERM"));
        assert_eq!(signal_name(libc::SIGKILL).as_deref(), Some("SIGKILL"));
    }

    #[test]
    fn every_known_signal_name_round_trips() {
        // cover EVERY arm of signal_name's match — exactly the eight
        // canonical signals the legacy Watcher reverse-mapped. Other
        // signals (STOP/CONT/TSTP…) go through the fallback `_ => SIG{num}`
        // arm, exercised by `unknown_signal_number_gets_sig_prefix` below.
        for name in [
            "SIGHUP", "SIGINT", "SIGQUIT", "SIGABRT", "SIGKILL", "SIGTERM", "SIGUSR1", "SIGUSR2",
        ] {
            let num = signal_number(name).expect("known signal");
            assert_eq!(signal_name(num).as_deref(), Some(name));
        }
        // SIGSTOP and SIGCONT exist in signal_number's match but NOT in
        // signal_name's — they fall to the fallback arm there, which is
        // fine; we just need their match arms in signal_number to execute.
        assert_eq!(signal_number("SIGSTOP"), Some(libc::SIGSTOP));
        assert_eq!(signal_number("SIGCONT"), Some(libc::SIGCONT));
    }

    #[test]
    fn unknown_signal_number_gets_sig_prefix() {
        // a number outside the canonical set: signal_name falls back to
        // "SIG<num>" — the legacy Watcher used the same shape for the JS
        // humanizer
        let unknown = 99; // not in the match arms above
        // sanity: 99 isn't any of the matched libc constants
        assert_ne!(unknown, libc::SIGHUP);
        assert_ne!(unknown, libc::SIGINT);
        assert_ne!(unknown, libc::SIGQUIT);
        assert_ne!(unknown, libc::SIGABRT);
        assert_ne!(unknown, libc::SIGKILL);
        assert_ne!(unknown, libc::SIGTERM);
        assert_ne!(unknown, libc::SIGUSR1);
        assert_ne!(unknown, libc::SIGUSR2);
        assert_eq!(signal_name(unknown).as_deref(), Some("SIG99"));
    }
}
