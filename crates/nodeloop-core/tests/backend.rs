//! `build_backend` — backend selection per options, including the inotify
//! → polling degradation path.

use nodeloop_core::config::RuntimeOptions;
use nodeloop_core::types::Backend;
use nodeloop_core::watcher::build_backend;

fn opts(backend: Backend) -> RuntimeOptions {
    RuntimeOptions {
        script: Some("app.js".into()),
        script_args: vec![],
        cwd: std::env::temp_dir().to_string_lossy().to_string(),
        exec: None,
        node_args: vec![],
        exts: vec!["js".into()],
        ignores: vec!["node_modules".into()],
        watch_paths: vec![],
        delay_ms: 100,
        max_wait_ms: 0,
        kill_signal: "SIGTERM".into(),
        kill_timeout_ms: 1000,
        backend,
        env: vec![],
        interactive_stdin: false,
    }
}

#[test]
fn polling_option_selects_polling_backend() {
    let mut b = build_backend(&opts(Backend::Polling(50)));
    let changes = b.poll(1); // first poll = baseline, reports nothing
    assert!(changes.is_empty());
    b.shutdown();
}

#[cfg(target_os = "linux")]
#[test]
fn events_option_selects_inotify_when_available() {
    let mut b = build_backend(&opts(Backend::Events));
    let _ = b.poll(1); // drain must work without panicking
    b.shutdown();
}

#[cfg(target_os = "linux")]
#[test]
fn events_backend_falls_back_to_polling_when_root_missing() {
    // when InotifyBackend::new fails (here: a cwd that doesn't exist →
    // inotify_add_watch returns EINVAL/ENOENT → add_dir returns None →
    // Inotify::new returns None), build_backend must degrade to polling
    // at the legacy 1s interval instead of panicking.
    let mut opts_bad = opts(Backend::Events);
    opts_bad.cwd = "/this/path/does/not/exist/nodeloop-probe-12347".into();
    opts_bad.backend = Backend::Events;
    // build_backend itself must NOT panic on the missing root — the polling
    // backend tolerates a vanished root (walk() returns early on read_dir err)
    let mut b = build_backend(&opts_bad);
    let _ = b.poll(1); // no panic
    b.shutdown();
}
