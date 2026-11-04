//! Process-tree cleanup — the nodemon guarantee: a restart kills not just
//! the child but EVERYTHING it spawned.
//!
//! POSIX: the child was spawned detached (own process group), so a
//! negative-pid signal reaches the whole tree; falls back to a direct
//! kill. Windows: `taskkill /T /F` walks the parent-child tree.

/// Kill `pid` and its whole tree. Returns true when a kill was attempted.
pub fn kill_tree(pid: u32, signal_name: &str) -> bool {
    #[cfg(unix)]
    {
        let sig = super::signals::signal_number(signal_name).unwrap_or(libc::SIGTERM);
        unsafe {
            // negative pid → the whole process group (child was spawned with
            // process_group(0))
            if libc::kill(-(pid as i32), sig) == 0 {
                return true;
            }
            libc::kill(pid as i32, sig) != -1
        }
    }
    #[cfg(windows)]
    {
        let _ = signal_name;
        use std::os::windows::process::CommandExt;
        std::process::Command::new("taskkill")
            .args(["/pid", &pid.to_string(), "/T", "/F"])
            .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .is_ok()
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = (pid, signal_name);
        false
    }
}

#[cfg(all(unix, test))]
mod tests {
    use super::*;

    #[test]
    fn kill_tree_reports_attempt() {
        use std::os::unix::process::CommandExt;
        // spawn a real process group and kill it
        let mut child = std::process::Command::new("sleep")
            .arg("5")
            .process_group(0)
            .spawn()
            .expect("sleep available");
        let pid = child.id();
        assert!(kill_tree(pid, "SIGTERM"));
        let _ = child.wait();
    }

    #[test]
    fn killing_dead_tree_is_reported_honestly() {
        // a pid that cannot exist: kill returns ESRCH → false
        assert!(!kill_tree(4_000_000, "SIGTERM"));
    }
}
