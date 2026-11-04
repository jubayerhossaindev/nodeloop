//! Watcher backends. Two implementations behind one tiny trait:
//!
//! * [`PollingBackend`] — the portable mtime+size scan, an exact port of
//!   the legacy `legacyWatch` polling watcher: the first scan is the
//!   BASELINE (never restarts); later scans diff modified/added/deleted
//!   files through the same filter. Works on every filesystem, including
//!   network shares and Docker bind mounts where fs events lie.
//! * [`InotifyBackend`] (Linux) — real native events via inotify(7),
//!   recursive directory watches, non-blocking reads. This is the
//!   `fs.watch(recursive)` replacement.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use super::filter::Filter;

/// A backend yields cwd-relative paths that passed the filter and changed.
pub trait WatchBackend: Send {
    /// Collect the changes since the last call. Blocks up to roughly
    /// `timeout_ms`; returns an empty vec on a quiet interval.
    fn poll(&mut self, timeout_ms: u64) -> Vec<String>;
    /// Shut the backend down (close fds, stop threads).
    fn shutdown(&mut self);
}

/// The mtime+size signature for one file — identical to the legacy
/// `legacyWatch` scanner's format.
fn file_signature(meta: &std::fs::Metadata) -> String {
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    format!("{mtime}:{}", meta.len())
}

/// The production metadata probe: `symlink_metadata` matches
/// `DirEntry::metadata()` semantics (links are described, not followed).
fn symlink_meta(p: &Path) -> std::io::Result<std::fs::Metadata> {
    std::fs::symlink_metadata(p)
}

/// Walk a directory tree, applying the filter, collecting file signatures.
/// `meta_of` is the metadata probe — injectable so the vanished-entry race
/// path (metadata fails between listing and stat) is unit-testable.
fn walk(
    dir: &Path,
    rel_base: &str,
    filter: &Filter,
    out: &mut HashMap<String, String>,
    meta_of: &dyn Fn(&Path) -> std::io::Result<std::fs::Metadata>,
) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return, // vanished dir between ticks
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let rel = if rel_base.is_empty() {
            name.clone()
        } else {
            format!("{rel_base}/{name}")
        };
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        if is_dir {
            // prune ignored trees BEFORE descending (dirs have no extension,
            // so matches() alone cannot express this — same as the legacy scan)
            let ignored = rel.split('/').any(|seg| filter.ignores_segment(seg));
            if !ignored {
                walk(&entry.path(), &rel, filter, out, meta_of);
            }
        } else if filter.matches(&rel)
            && let Ok(meta) = meta_of(&entry.path())
        {
            out.insert(rel, file_signature(&meta));
        }
    }
}

/// Portable mtime+size polling backend (legacyWatch parity): scans, then
/// diffs; `poll()` sleeps the interval FIRST so the cadence matches the
/// legacy `setInterval(scan, interval)` exactly.
pub struct PollingBackend {
    root: PathBuf,
    interval_ms: u64,
    baseline_applied: bool,
    seen: HashMap<String, String>,
    filter: Filter,
}

impl PollingBackend {
    pub fn new(root: PathBuf, filter: Filter, interval_ms: u64) -> Self {
        Self {
            root,
            interval_ms: interval_ms.max(1),
            baseline_applied: false,
            seen: HashMap::new(),
            filter,
        }
    }

    fn scan(&mut self) -> HashMap<String, String> {
        let mut next = HashMap::new();
        walk(&self.root, "", &self.filter, &mut next, &symlink_meta);
        next
    }
}

impl WatchBackend for PollingBackend {
    fn poll(&mut self, _timeout_ms: u64) -> Vec<String> {
        std::thread::sleep(std::time::Duration::from_millis(self.interval_ms));
        let next = self.scan();
        let mut changed: Vec<String> = Vec::new();

        if self.baseline_applied {
            for (rel, sig) in &next {
                if self.seen.get(rel).map(|s| s != sig).unwrap_or(true) {
                    changed.push(rel.clone());
                }
            }
            for rel in self.seen.keys() {
                if !next.contains_key(rel) {
                    changed.push(rel.clone()); // deleted → restart, same as fs.watch rename away
                }
            }
        }
        self.seen = next;
        self.baseline_applied = true;
        changed
    }

    fn shutdown(&mut self) {}
}

#[cfg(target_os = "linux")]
mod inotify {
    //! Minimal recursive inotify backend (Linux only), using libc directly.
    use std::collections::HashMap;
    use std::ffi::CStr;
    use std::os::unix::io::RawFd;
    use std::path::{Path, PathBuf};
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, Ordering};

    pub(super) const IN_CLOSE_WRITE: u32 = 0x0000_0008;
    pub(super) const IN_MODIFY: u32 = 0x0000_0002;
    pub(super) const IN_CREATE: u32 = 0x0000_0100;
    pub(super) const IN_DELETE: u32 = 0x0000_0200;
    pub(super) const IN_MOVED_FROM: u32 = 0x0000_0040;
    pub(super) const IN_MOVED_TO: u32 = 0x0000_0080;
    pub(super) const IN_MOVE_SELF: u32 = 0x0000_0800;
    pub(super) const IN_DELETE_SELF: u32 = 0x0000_0400;
    pub(super) const IN_ONLYDIR: u32 = 0x0100_0000;
    pub(super) const IN_Q_OVERFLOW: u32 = 0x0000_4000;
    const EVENT_MASK: u32 = IN_CLOSE_WRITE
        | IN_MODIFY
        | IN_CREATE
        | IN_DELETE
        | IN_MOVED_FROM
        | IN_MOVED_TO
        | IN_MOVE_SELF
        | IN_DELETE_SELF;

    const NAME_MAX: usize = 4096;
    pub(super) const EVENT_SIZE: usize = 16;
    const BUF_LEN: usize = (EVENT_SIZE + NAME_MAX + 1) * 64;

    unsafe extern "C" {
        fn inotify_init1(flags: i32) -> i32;
        fn inotify_add_watch(fd: i32, pathname: *const std::ffi::c_char, mask: u32) -> i32;
        fn inotify_rm_watch(fd: i32, wd: i32) -> i32;
        fn read(fd: i32, buf: *mut std::ffi::c_void, count: usize) -> isize;
        fn close(fd: i32) -> i32;
    }

    /// Recursive inotify watcher. `poll` drains the queue non-blocking and
    /// sleeps ~`timeout_ms` when quiet.
    pub struct Inotify {
        fd: RawFd,
        root: PathBuf,
        pub(super) wd_to_dir: HashMap<i32, String>,
        stop: Arc<AtomicBool>,
    }

    impl Inotify {
        pub fn new(root: PathBuf) -> Option<Self> {
            Self::new_with(root, |flags| unsafe { inotify_init1(flags) })
        }

        /// Injectable constructor — `init1` stands in for the real
        /// `inotify_init1` syscall so the fd-failure branch is unit-testable
        /// without exhausting kernel limits.
        pub(super) fn new_with(root: PathBuf, init1: impl Fn(i32) -> i32) -> Option<Self> {
            let fd = init1(0x800 | 0x80000); // IN_NONBLOCK | IN_CLOEXEC
            if fd < 0 {
                return None;
            }
            let mut me = Self {
                fd,
                root,
                wd_to_dir: HashMap::new(),
                stop: Arc::new(AtomicBool::new(false)),
            };
            me.add_dir(&me.root.clone(), "")?;
            Some(me)
        }

        /// Recursively watch `abs_dir`, mapping wds → cwd-relative dir.
        /// `read_dir` runs BEFORE `inotify_add_watch` so an unreadable
        /// directory never gets a half-registered watch (both checks need
        /// read permission anyway).
        pub(super) fn add_dir(&mut self, abs_dir: &Path, rel: &str) -> Option<()> {
            let cpath =
                std::ffi::CString::new(abs_dir.as_os_str().to_string_lossy().as_bytes()).ok()?;
            let entries = match std::fs::read_dir(abs_dir) {
                Ok(e) => e,
                // unreadable or vanished dir between ticks — skip the whole
                // subtree instead of panicking (the polling walk does the same)
                Err(_) => return None,
            };
            let wd = unsafe { inotify_add_watch(self.fd, cpath.as_ptr(), EVENT_MASK | IN_ONLYDIR) };
            if wd < 0 {
                return None;
            }
            self.wd_to_dir.insert(wd, rel.to_string());
            for entry in entries.flatten() {
                if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    let sub_rel = if rel.is_empty() {
                        entry.file_name().to_string_lossy().to_string()
                    } else {
                        format!("{rel}/{}", entry.file_name().to_string_lossy())
                    };
                    self.add_dir(&entry.path(), &sub_rel);
                }
            }
            Some(())
        }

        /// Drain one batch of kernel events into (rel-path, is-dir-create).
        pub fn drain(&mut self) -> Vec<(String, bool)> {
            let mut out = Vec::new();
            let mut buf = [0u8; BUF_LEN];
            loop {
                let n =
                    unsafe { read(self.fd, buf.as_mut_ptr() as *mut std::ffi::c_void, BUF_LEN) };
                if n <= 0 {
                    break;
                }
                out.extend(self.parse_batch(&buf, n as usize));
            }
            out
        }

        /// Decode ONE read() batch of packed `inotify_event` records.
        /// Split out from `drain` so every mask branch (overflow, dir
        /// create, self-move, unknown wd, malformed name…) is unit-testable
        /// with hand-crafted buffers — no kernel races required.
        pub(super) fn parse_batch(&mut self, buf: &[u8], n: usize) -> Vec<(String, bool)> {
            let mut out = Vec::new();
            let mut off = 0usize;
            while off + EVENT_SIZE <= n {
                let wd = i32::from_ne_bytes(buf[off..off + 4].try_into().unwrap());
                let mask = u32::from_ne_bytes(buf[off + 4..off + 8].try_into().unwrap());
                let len = u32::from_ne_bytes(buf[off + 12..off + 16].try_into().unwrap()) as usize;
                let name = if len > 0 {
                    let end = (off + EVENT_SIZE + len).min(n);
                    let raw = &buf[off + EVENT_SIZE..end];
                    CStr::from_bytes_until_nul(raw)
                        .map(|c| c.to_string_lossy().to_string())
                        .unwrap_or_default()
                } else {
                    String::new()
                };
                off += EVENT_SIZE + len;

                if mask & IN_Q_OVERFLOW != 0 {
                    // queue overflow: report root change so a restart
                    // reloads the true state (safe over-approximation)
                    out.push((String::new(), false));
                    continue;
                }
                let dir = self.wd_to_dir.get(&wd).cloned().unwrap_or_default();
                let rel = if name.is_empty() {
                    dir.clone()
                } else if dir.is_empty() {
                    name.clone()
                } else {
                    format!("{dir}/{name}")
                };

                if mask & (IN_CREATE | IN_MOVED_TO) != 0 {
                    let abs = self.root.join(&rel);
                    if abs.is_dir() {
                        // new directory: watch it recursively + signal
                        let _ = self.add_dir(&abs, &rel);
                        out.push((rel, true));
                        continue;
                    }
                    out.push((rel, false));
                } else if mask & (IN_CLOSE_WRITE | IN_MODIFY | IN_DELETE | IN_MOVED_FROM) != 0 {
                    out.push((rel, false));
                } else if mask & (IN_MOVE_SELF | IN_DELETE_SELF) != 0 {
                    // a watched dir itself moved/vanished — drop its map
                    self.wd_to_dir.remove(&wd);
                    let _ = unsafe { inotify_rm_watch(self.fd, wd) };
                }
            }
            out
        }

        #[allow(dead_code)] // part of the backend contract; the poll loop drives stop
        pub fn stop_flag(&self) -> Arc<AtomicBool> {
            Arc::clone(&self.stop)
        }

        pub fn is_stopped(&self) -> bool {
            self.stop.load(Ordering::Relaxed)
        }

        pub fn request_stop(&self) {
            self.stop.store(true, Ordering::Relaxed);
        }

        #[allow(dead_code)] // diagnostics; kept for contract completeness
        pub fn root(&self) -> &Path {
            &self.root
        }

        pub fn close(&mut self) {
            if self.fd >= 0 {
                unsafe { close(self.fd) };
                self.fd = -1;
            }
        }
    }
}

#[cfg(target_os = "linux")]
use inotify::Inotify;

/// Linux inotify backend with a quiet-sleep poll loop.
#[cfg(target_os = "linux")]
pub struct InotifyBackend {
    inner: Inotify,
    filter: Filter,
}

#[cfg(target_os = "linux")]
impl InotifyBackend {
    pub fn new(root: PathBuf, filter: Filter) -> Option<Self> {
        Inotify::new(root).map(|inner| Self { inner, filter })
    }
}

#[cfg(target_os = "linux")]
impl WatchBackend for InotifyBackend {
    fn poll(&mut self, timeout_ms: u64) -> Vec<String> {
        if self.inner.is_stopped() {
            return Vec::new();
        }
        let raw = self.inner.drain();
        if raw.is_empty() {
            std::thread::sleep(std::time::Duration::from_millis(timeout_ms.clamp(10, 100)));
            return Vec::new();
        }
        let mut changed: Vec<String> = Vec::new();
        for (rel, _is_dir) in raw {
            if rel.is_empty() || self.filter.matches(&rel) {
                changed.push(rel);
            }
        }
        changed
    }

    fn shutdown(&mut self) {
        self.inner.request_stop();
        self.inner.close();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn js_filter() -> Filter {
        Filter::new(
            &["js".to_string()],
            &["node_modules".to_string(), ".git".to_string()],
            vec![],
        )
    }

    #[test]
    fn polling_baseline_then_changes() {
        let tmp = tempfile::tempdir().unwrap();
        let app = tmp.path().join("app.js");
        std::fs::write(&app, "1").unwrap();

        let mut b = PollingBackend::new(tmp.path().to_path_buf(), js_filter(), 1);
        // baseline scan sees the file, reports nothing
        assert!(b.poll(0).is_empty());
        // no change
        assert!(b.poll(0).is_empty());
        // modify
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(&app, "2").unwrap();
        let changes = b.poll(0);
        assert_eq!(changes, vec!["app.js".to_string()]);
        // add
        std::fs::write(tmp.path().join("new.js"), "x").unwrap();
        let changes = b.poll(0);
        assert!(changes.contains(&"new.js".to_string()));
        // delete
        std::fs::remove_file(&app).unwrap();
        let changes = b.poll(0);
        assert!(changes.contains(&"app.js".to_string()));
        b.shutdown();
    }

    #[test]
    fn polling_prunes_ignored_dirs() {
        let tmp = tempfile::tempdir().unwrap();
        let nm = tmp.path().join("node_modules");
        std::fs::create_dir_all(&nm).unwrap();
        std::fs::write(nm.join("lib.js"), "x").unwrap();
        std::fs::write(tmp.path().join("app.js"), "1").unwrap();

        let mut b = PollingBackend::new(tmp.path().to_path_buf(), js_filter(), 1);
        assert!(b.poll(0).is_empty());
        let mut b2 = PollingBackend::new(tmp.path().to_path_buf(), js_filter(), 1);
        let sig = b2.scan();
        // node_modules/lib.js never enters the signature map
        assert!(!sig.contains_key("node_modules/lib.js"));
        assert!(sig.contains_key("app.js"));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn inotify_sees_writes() {
        let tmp = tempfile::tempdir().unwrap();
        let app = tmp.path().join("app.js");
        std::fs::write(&app, "1").unwrap();

        let mut b =
            InotifyBackend::new(tmp.path().to_path_buf(), js_filter()).expect("inotify available");
        std::thread::sleep(std::time::Duration::from_millis(120));
        std::fs::write(&app, "2").unwrap();
        // bounded retry loop — `any` short-circuits on the first hit and
        // the quiet polls before the write exercise the false path too
        let seen = (0..100).any(|_| b.poll(50).iter().any(|p| p == "app.js"));
        assert!(seen, "inotify must report app.js changes");
        b.shutdown();
    }

    #[test]
    fn polling_walk_skips_files_that_fail_the_filter() {
        // a non-matching file (wrong extension) must not enter the signature
        // map — the walk's filter-mismatch path
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("app.js"), "1").unwrap();
        std::fs::write(tmp.path().join("notes.txt"), "ignore me").unwrap();

        let mut b = PollingBackend::new(tmp.path().to_path_buf(), js_filter(), 1);
        assert!(b.poll(0).is_empty());
        let sig = b.scan();
        assert!(sig.contains_key("app.js"));
        assert!(
            !sig.contains_key("notes.txt"),
            "filtered file must not be tracked"
        );
        b.shutdown();
    }

    #[test]
    fn polling_walk_tolerates_broken_symlinks() {
        // DirEntry::metadata() does NOT follow symlinks (lstat semantics),
        // so even a symlink whose target is gone gets described — the scan
        // tracks the LINK itself and never panics
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("app.js"), "1").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(
            "/nonexistent/nodeloop-ghost-target",
            tmp.path().join("ghost.js"),
        )
        .unwrap();

        let mut b = PollingBackend::new(tmp.path().to_path_buf(), js_filter(), 1);
        assert!(b.poll(0).is_empty(), "baseline poll must not panic");
        let sig = b.scan();
        assert!(sig.contains_key("app.js"));
        assert!(
            sig.contains_key("ghost.js"),
            "the link itself is described (lstat semantics)"
        );
        b.shutdown();
    }

    #[test]
    fn walk_survives_metadata_failures() {
        // entries that vanish BETWEEN read_dir and the metadata probe (the
        // classic scanner race) are skipped silently — injected via a failing
        // probe so the path is deterministic
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("app.js"), "1").unwrap();
        let mut out = HashMap::new();
        let boom = |_p: &Path| -> std::io::Result<std::fs::Metadata> {
            Err(std::io::Error::from_raw_os_error(2)) // ENOENT
        };
        walk(tmp.path(), "", &js_filter(), &mut out, &boom);
        assert!(out.is_empty(), "failed probes must not insert signatures");
        // and the production probe still works on the same tree
        walk(tmp.path(), "", &js_filter(), &mut out, &symlink_meta);
        assert!(out.contains_key("app.js"));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn inotify_add_dir_tolerates_unreadable_subdir() {
        // a subdirectory the process cannot read (mode 000) → read_dir Err
        // → add_dir continues without recursion instead of panicking
        let tmp = tempfile::tempdir().unwrap();
        let locked = tmp.path().join("locked");
        std::fs::create_dir(&locked).unwrap();
        std::fs::write(locked.join("secret.js"), "x").unwrap();
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o000)).unwrap();
        }
        // construction must succeed (root itself is readable); the locked
        // subtree simply yields no watch
        let built = InotifyBackend::new(tmp.path().to_path_buf(), js_filter());
        // restore permissions BEFORE dropping tempdir so cleanup works
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        assert!(
            built.is_some(),
            "unreadable subdir must not break construction"
        );
        let mut backend = built.unwrap();
        let _ = backend.poll(1);
        backend.shutdown();
    }

    /* ----------------- synthetic inotify_event buffer tests ---------------- */
    //
    // `parse_batch` decodes packed kernel records. Building the bytes by
    // hand covers every mask branch deterministically — no queue-overflow
    // storms or rename races needed.

    #[cfg(target_os = "linux")]
    mod synthetic {
        use super::super::inotify::{EVENT_SIZE, Inotify};
        use super::super::inotify::{
            IN_CLOSE_WRITE, IN_CREATE, IN_DELETE, IN_DELETE_SELF, IN_MODIFY, IN_MOVE_SELF,
            IN_MOVED_FROM, IN_Q_OVERFLOW,
        };
        use std::path::PathBuf;
        use std::sync::atomic::Ordering;

        use super::js_filter;

        /// Build one packed inotify_event record, exactly as the kernel lays
        /// it out: nameless events (Q_OVERFLOW, DELETE_SELF, MOVE_SELF…)
        /// carry `len = 0` and NO name field; named events are NUL-terminated
        /// and padded to an 8-byte boundary.
        fn event(wd: i32, mask: u32, name: &[u8]) -> Vec<u8> {
            let mut rec = Vec::with_capacity(EVENT_SIZE + name.len() + 1);
            rec.extend_from_slice(&wd.to_ne_bytes());
            rec.extend_from_slice(&mask.to_ne_bytes());
            rec.extend_from_slice(&0u32.to_ne_bytes()); // cookie
            if name.is_empty() {
                rec.extend_from_slice(&0u32.to_ne_bytes()); // len = 0
                return rec;
            }
            let padded = (name.len() + 1).div_ceil(8) * 8;
            rec.extend_from_slice(&(padded as u32).to_ne_bytes());
            rec.extend_from_slice(name);
            rec.push(0); // NUL terminator
            while rec.len() < EVENT_SIZE + padded {
                rec.push(0); // kernel padding
            }
            rec
        }

        fn ino(root: PathBuf) -> Inotify {
            Inotify::new(root).expect("inotify available")
        }

        #[test]
        fn queue_overflow_reports_root_change() {
            let tmp = tempfile::tempdir().unwrap();
            let mut ino = ino(tmp.path().to_path_buf());
            let buf = event(-1, IN_Q_OVERFLOW, b"");
            let out = ino.parse_batch(&buf, buf.len());
            assert_eq!(out, vec![(String::new(), false)]);
            ino.close();
        }

        #[test]
        fn modify_with_known_wd_prefixes_dir() {
            let tmp = tempfile::tempdir().unwrap();
            let mut ino = ino(tmp.path().to_path_buf());
            // simulate a wd the recursive add_dir registered for "sub"
            ino.wd_to_dir.insert(7, "sub".into());
            let buf = event(7, IN_MODIFY, b"app.js");
            let out = ino.parse_batch(&buf, buf.len());
            assert_eq!(out, vec![("sub/app.js".to_string(), false)]);
            ino.close();
        }

        #[test]
        fn modify_with_unknown_wd_uses_bare_name() {
            let tmp = tempfile::tempdir().unwrap();
            let mut ino = ino(tmp.path().to_path_buf());
            let buf = event(4242, IN_MODIFY, b"app.js");
            let out = ino.parse_batch(&buf, buf.len());
            assert_eq!(out, vec![("app.js".to_string(), false)]);
            ino.close();
        }

        #[test]
        fn empty_name_falls_back_to_watched_dir_path() {
            // events on the watched directory ITSELF (e.g. IN_DELETE with
            // len=0) resolve to the directory's own relative path
            let tmp = tempfile::tempdir().unwrap();
            let mut ino = ino(tmp.path().to_path_buf());
            ino.wd_to_dir.insert(9, "sub".into());
            let buf = event(9, IN_DELETE, b"");
            let out = ino.parse_batch(&buf, buf.len());
            assert_eq!(out, vec![("sub".to_string(), false)]);
            ino.close();
        }

        #[test]
        fn create_on_existing_dir_recurses_and_marks_dir() {
            let tmp = tempfile::tempdir().unwrap();
            std::fs::create_dir(tmp.path().join("fresh")).unwrap();
            let mut ino = ino(tmp.path().to_path_buf());
            let buf = event(1, IN_CREATE, b"fresh");
            let out = ino.parse_batch(&buf, buf.len());
            assert_eq!(out, vec![("fresh".to_string(), true)]);
            // the recursion registered a wd for the new dir
            assert!(ino.wd_to_dir.values().any(|d| d == "fresh"));
            ino.close();
        }

        #[test]
        fn create_on_a_file_reports_plain_change() {
            let tmp = tempfile::tempdir().unwrap();
            std::fs::write(tmp.path().join("new.js"), "x").unwrap();
            let mut ino = ino(tmp.path().to_path_buf());
            let buf = event(1, IN_CREATE, b"new.js");
            let out = ino.parse_batch(&buf, buf.len());
            assert_eq!(out, vec![("new.js".to_string(), false)]);
            ino.close();
        }

        #[test]
        fn close_write_and_moved_from_are_plain_changes() {
            let tmp = tempfile::tempdir().unwrap();
            let mut ino = ino(tmp.path().to_path_buf());
            let mut buf = event(1, IN_CLOSE_WRITE, b"a.js");
            buf.extend(event(1, IN_MOVED_FROM, b"b.js"));
            let out = ino.parse_batch(&buf, buf.len());
            assert_eq!(
                out,
                vec![("a.js".to_string(), false), ("b.js".to_string(), false)]
            );
            ino.close();
        }

        #[test]
        fn move_self_drops_the_watched_dir_mapping() {
            let tmp = tempfile::tempdir().unwrap();
            let mut ino = ino(tmp.path().to_path_buf());
            ino.wd_to_dir.insert(11, "gone".into());
            let buf = event(11, IN_MOVE_SELF, b"");
            let out = ino.parse_batch(&buf, buf.len());
            assert!(out.is_empty(), "self-move produces no change event");
            assert!(
                !ino.wd_to_dir.contains_key(&11),
                "wd mapping must be dropped"
            );
            ino.close();
        }

        #[test]
        fn delete_self_also_drops_the_mapping() {
            let tmp = tempfile::tempdir().unwrap();
            let mut ino = ino(tmp.path().to_path_buf());
            ino.wd_to_dir.insert(12, "vanished".into());
            let buf = event(12, IN_DELETE_SELF, b"");
            let out = ino.parse_batch(&buf, buf.len());
            assert!(out.is_empty());
            assert!(!ino.wd_to_dir.contains_key(&12));
            ino.close();
        }

        #[test]
        fn malformed_name_without_nul_degrades_to_empty() {
            // a name field with no NUL inside `len` bytes — the CStr parse
            // fails and degrades to "" (defensive; the kernel always NUL-
            // terminates, but a truncated read could produce this)
            let tmp = tempfile::tempdir().unwrap();
            let mut ino = ino(tmp.path().to_path_buf());
            let mut rec = Vec::new();
            rec.extend_from_slice(&1i32.to_ne_bytes());
            rec.extend_from_slice(&IN_MODIFY.to_ne_bytes());
            rec.extend_from_slice(&0u32.to_ne_bytes());
            rec.extend_from_slice(&5u32.to_ne_bytes()); // len = 5
            rec.extend_from_slice(b"abcde"); // NO NUL
            let out = ino.parse_batch(&rec, rec.len());
            assert_eq!(out, vec![(String::new(), false)]);
            ino.close();
        }

        #[test]
        fn truncated_tail_is_ignored() {
            // a trailing partial record (off + EVENT_SIZE > n) must not
            // panic or produce output
            let tmp = tempfile::tempdir().unwrap();
            let mut ino = ino(tmp.path().to_path_buf());
            let full = event(1, IN_MODIFY, b"a.js");
            let mut buf = full.clone();
            buf.extend_from_slice(&[0u8; 4]); // 4 bytes < EVENT_SIZE
            let out = ino.parse_batch(&buf, buf.len());
            assert_eq!(out.len(), 1, "only the complete record decodes");
            ino.close();
        }

        #[test]
        fn zero_length_batch_is_a_noop() {
            let tmp = tempfile::tempdir().unwrap();
            let mut ino = ino(tmp.path().to_path_buf());
            assert!(ino.parse_batch(&[], 0).is_empty());
            ino.close();
        }

        /* -------------- constructor failure branches -------------- */

        #[test]
        fn init_failure_yields_none() {
            // injected init1 returns -1 → Inotify::new_with → None, without
            // exhausting real kernel limits
            let tmp = tempfile::tempdir().unwrap();
            let result = Inotify::new_with(tmp.path().to_path_buf(), |_flags| -1);
            assert!(result.is_none(), "fd<0 must map to None");
        }

        #[test]
        fn root_that_is_a_file_yields_none() {
            // a regular FILE root: read_dir fails (ENOTDIR) before any watch
            // is registered → add_dir → None
            let tmp = tempfile::tempdir().unwrap();
            let file = tmp.path().join("plain.txt");
            std::fs::write(&file, "x").unwrap();
            assert!(Inotify::new(file).is_none());
        }

        #[test]
        fn add_watch_failure_yields_none() {
            // read_dir succeeds but inotify_add_watch fails (here: the fd is
            // already closed → EBADF) → wd < 0 → None, without panicking
            let tmp = tempfile::tempdir().unwrap();
            let mut ino = ino(tmp.path().to_path_buf());
            ino.close(); // fd = -1
            let out = ino.add_dir(tmp.path(), "");
            assert!(out.is_none(), "add_watch on a closed fd must yield None");
        }

        #[test]
        fn root_with_interior_nul_yields_none() {
            // CString::new rejects interior NULs → add_dir → None before any
            // watch is registered
            let tmp = tempfile::tempdir().unwrap();
            let bad = tmp.path().join("a\0b");
            assert!(Inotify::new(bad).is_none());
        }

        /* -------------- lifecycle / diagnostics methods -------------- */

        #[test]
        fn stop_flag_root_and_stop_round_trip() {
            let tmp = tempfile::tempdir().unwrap();
            let mut ino = ino(tmp.path().to_path_buf());
            assert_eq!(ino.root(), tmp.path());
            assert!(!ino.is_stopped());
            let flag = ino.stop_flag();
            assert!(!flag.load(Ordering::Relaxed));
            ino.request_stop();
            assert!(ino.is_stopped());
            assert!(flag.load(Ordering::Relaxed));
            ino.close();
        }

        #[test]
        fn close_is_idempotent() {
            let tmp = tempfile::tempdir().unwrap();
            let mut ino = ino(tmp.path().to_path_buf());
            ino.close();
            ino.close(); // second close: fd already -1 → no double-close
        }

        #[test]
        fn stopped_backend_poll_returns_empty_without_sleeping_long() {
            let tmp = tempfile::tempdir().unwrap();
            let mut backend: Box<dyn crate::watcher::WatchBackend> = Box::new(
                super::super::InotifyBackend::new(tmp.path().to_path_buf(), js_filter()).unwrap(),
            );
            backend.shutdown(); // request_stop + close
            let t0 = std::time::Instant::now();
            let out = backend.poll(10);
            assert!(out.is_empty(), "stopped backend must report nothing");
            assert!(
                t0.elapsed() < std::time::Duration::from_millis(50),
                "stopped poll must short-circuit before the quiet-sleep"
            );
        }
    }
}
