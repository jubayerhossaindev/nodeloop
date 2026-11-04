//! Gap-closure tests for the small public helpers whose production call
//! paths only fire under specific configurations (numeric kill signals,
//! watch scopes, non-empty extension lists, second polling rounds) and for
//! the plain API-surface stubs. Everything here goes through the PUBLIC
//! crate API exactly the way a downstream consumer would.

use std::collections::HashMap;

use nodeloop_core::config::RuntimeOptions;
use nodeloop_core::engine::debounce::Debouncer;
use nodeloop_core::engine::restart::RestartAccounting;
use nodeloop_core::process::command::{SpawnSpec, child_alive, spawn_child};
use nodeloop_core::process::signals::signal_number;
use nodeloop_core::types::Backend;
use nodeloop_core::watcher::{Filter, PollingBackend, WatchBackend, normalize_exts};

#[test]
fn restart_accounting_pending_flags_queue_take_and_query() {
    // production only queues while a kill is in flight; exercise the whole
    // flag lifecycle directly
    let mut a = RestartAccounting::new();
    assert!(!a.is_pending(), "fresh accounting has nothing pending");
    a.queue_pending();
    assert!(a.is_pending(), "queue_pending must raise the flag");
    assert!(a.take_pending(), "take_pending consumes the flag");
    assert!(!a.is_pending(), "flag cleared after take");
    assert!(!a.take_pending(), "second take finds nothing");
}

#[test]
fn debouncer_bursting_tracks_the_burst_window() {
    let mut d = Debouncer::new(50, 100);
    assert!(!d.bursting(), "no burst before the first change");
    let t0 = std::time::Instant::now();
    assert_eq!(d.wait_for(t0), 50, "first change opens the burst window");
    assert!(d.bursting(), "burst window open after wait_for");
    d.reset_burst();
    assert!(!d.bursting(), "reset_burst closes the window");
}

#[test]
fn numeric_signal_names_fall_through_to_raw_number() {
    // the match in signal_number has no arm for bare numbers — they reach
    // the raw_number fallback and pass through as-is
    assert_eq!(signal_number("9"), Some(9));
    assert_eq!(signal_number("15"), Some(15));
    assert_eq!(signal_number("007"), Some(7), "leading zeros still parse");
    assert_eq!(signal_number(""), None, "empty string is not a number");
    assert_eq!(signal_number("12x"), None, "mixed alphanumeric rejected");
}

#[test]
fn child_alive_reports_true_for_a_spawned_child() {
    // API-symmetry stub: liveness is decided by the supervisor's waiter
    // thread, so the query answers true for any spawned (unreaped) child
    let spec = SpawnSpec {
        file: "/bin/sleep".into(),
        args: vec!["0.3".into()],
        shell: false,
    };
    let mut child = spawn_child(&spec, "/tmp", &[], false).expect("spawn works");
    assert!(child_alive(&child.child), "unreaped child counts as alive");
    let _ = child.child.wait();
}

#[test]
fn filter_watch_scope_closure_accepts_inside_and_rejects_outside() {
    // with watch_paths set, matches() walks the scope list through a
    // closure comparing rel == prefix or rel under prefix + "/"
    let f = Filter::new(&["js".to_string()], &[], vec!["src".to_string()]);
    assert!(f.matches("src/main.js"), "inside the scope");
    assert!(f.matches("src/deep/nested.js"), "subdirectory of the scope");
    assert!(!f.matches("docs/readme.js"), "outside the scope");
    assert!(
        !f.matches("srcx/other.js"),
        "prefix must match on a boundary"
    );
    // empty watch_paths → scope check skipped entirely
    let open = Filter::new(&["js".to_string()], &[], vec![]);
    assert!(open.matches("anything/here.js"));
}

#[test]
fn normalize_exts_trims_dots_blanks_and_case() {
    // the three iterator closures (trim/lowercase, dot-strip, blank-drop)
    // only execute when the incoming list is non-empty
    // strip_prefix removes ONE leading dot (legacy parity): "..." → ".."
    let exts = normalize_exts(&[
        " .TS ".to_string(),
        String::new(),
        ".Json".to_string(),
        "...".to_string(),
        "MJS".to_string(),
    ]);
    assert_eq!(
        exts,
        vec!["ts", "json", "..", "mjs"],
        "normalized in order; only one leading dot is stripped"
    );
    assert!(normalize_exts(&[]).is_empty(), "empty input → empty output");
}

#[test]
fn polling_backend_diffs_a_second_round_against_its_baseline() {
    // poll #1 only establishes the baseline; poll #2 detects an addition;
    // poll #3 compares signatures through the diff closure (unchanged file
    // must NOT be reported); poll #4 reports the deletion
    let tmp = tempfile::tempdir().expect("tempdir");
    let root = tmp.path().to_path_buf();
    let filter = Filter::new(&["js".to_string()], &[], vec![]);
    let mut backend = PollingBackend::new(root.clone(), filter, 1);

    let seen: HashMap<String, String> = HashMap::new();
    let _ = seen; // silence unused-import shape on non-polling platforms

    assert!(
        backend.poll(1).is_empty(),
        "first poll only lays the baseline"
    );
    std::fs::write(root.join("a.js"), "one").unwrap();
    let second = backend.poll(1);
    assert_eq!(second, vec!["a.js".to_string()], "addition detected");
    let third = backend.poll(1);
    assert!(third.is_empty(), "unchanged signature must not re-report");
    std::fs::write(root.join("a.js"), "one-two").unwrap();
    let fourth = backend.poll(1);
    assert_eq!(fourth, vec!["a.js".to_string()], "content change detected");
    std::fs::remove_file(root.join("a.js")).unwrap();
    let fifth = backend.poll(1);
    assert_eq!(fifth, vec!["a.js".to_string()], "deletion detected");
}

#[test]
fn runtime_options_accepts_a_numeric_kill_signal() {
    // normalize_signal's numeric branch (raw.chars().all(is_ascii_digit))
    // only runs when the configured kill signal is a bare number
    let opts = RuntimeOptions::build(
        None,
        vec![],
        std::env::temp_dir().to_string_lossy().to_string(),
        Some("sleep 30".to_string()),
        vec![],
        vec![],
        vec![],
        vec![],
        None,
        None,
        Some("15".to_string()),
        None,
        Backend::Events,
        vec![],
        false,
    )
    .expect("numeric kill signal is valid");
    assert_eq!(opts.kill_signal, "15", "numeric signal passes through");
}

#[test]
fn normalize_watch_paths_makes_absolute_paths_cwd_relative() {
    use nodeloop_core::watcher::normalize_watch_paths;

    let cwd = std::env::temp_dir().to_string_lossy().to_string();
    let inside = std::path::Path::new(&cwd).join("project/src");
    let watched = normalize_watch_paths(
        &[
            "./src/".to_string(),
            inside.to_string_lossy().to_string(),
            String::new(),
            "src".to_string(),
        ],
        &cwd,
    );
    // "./src/" → "src"; the absolute path under cwd becomes relative; the
    // blank entry is dropped; "src" dedups against the first
    assert_eq!(watched, vec!["src", "project/src"]);
    // absolute path OUTSIDE cwd stays absolute (with separators normalized)
    let outside = normalize_watch_paths(&["/var/log/app".to_string()], &cwd);
    assert_eq!(outside, vec!["/var/log/app"]);
}

#[test]
fn normalize_ignores_keeps_display_spelling_and_dedups_case_insensitively() {
    use nodeloop_core::watcher::normalize_ignores;

    let (set, display) = normalize_ignores(&[
        ".Git".to_string(),
        " node_modules ".to_string(),
        ".git".to_string(),
        String::new(),
    ]);
    // match set is lowercased + deduped; display keeps the ORIGINAL spelling
    assert_eq!(set, vec![".git", "node_modules"]);
    assert_eq!(display, vec![".Git", "node_modules"]);
}

#[test]
fn runtime_options_stores_watch_and_ignore_lists_as_configured() {
    // RuntimeOptions::build keeps watch/ignore verbatim (the legacy port
    // ships the normalizers as standalone public helpers — covered above);
    // assert the raw-storage contract the Filter consumers rely on
    let opts = RuntimeOptions::build(
        None,
        vec![],
        std::env::temp_dir().to_string_lossy().to_string(),
        Some("sleep 30".to_string()),
        vec![],
        vec![],
        vec!["node_modules".to_string(), ".Git".to_string()],
        vec!["./src/".to_string()],
        None,
        None,
        None,
        None,
        Backend::Events,
        vec![],
        false,
    )
    .expect("watch/ignore opts are valid");
    assert_eq!(opts.watch_paths, vec!["./src/"], "watch list stored raw");
    // user ignores are lowercased by the builder and lead the list before
    // the appended defaults (node_modules, .git, .npm, coverage, .ds_store)
    assert!(
        opts.ignores
            .starts_with(&["node_modules".to_string(), ".git".to_string()]),
        "lowercased user ignores must lead the list, got {:?}",
        opts.ignores
    );
    assert!(
        opts.ignores.contains(&".npm".to_string()),
        "defaults appended"
    );
}

#[test]
fn events_backend_survives_a_watched_directory_vanishing() {
    // deleting a watched SUBDIRECTORY delivers IN_DELETE_SELF for the dir's
    // own watch descriptor — the backend must drop the wd mapping, call
    // inotify_rm_watch, and keep polling without panic
    use nodeloop_core::watcher::build_backend;

    let tmp = tempfile::tempdir().expect("tempdir");
    let subdir = tmp.path().join("pkg");
    std::fs::create_dir(&subdir).expect("create watched subdir");
    std::fs::write(subdir.join("mod.js"), "export 1;").expect("seed file");

    let opts = RuntimeOptions::build(
        None,
        vec![],
        tmp.path().to_string_lossy().to_string(),
        Some("sleep 30".to_string()),
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
    .expect("events opts valid");

    let mut backend = build_backend(&opts);
    let _ = backend.poll(1); // baseline — registers the root + subdir watches
    std::fs::write(subdir.join("mod.js"), "export 2;").expect("touch inside subdir");
    let _ = backend.poll(1); // processes the modify inside the subdir
    std::fs::remove_dir_all(&subdir).expect("delete the watched subdir");
    // the next tick hits IN_DELETE_SELF / IN_MOVED_FROM for the dir + its wd
    let _ = backend.poll(1);
    // backend stays healthy afterwards
    let _ = backend.poll(1);
    backend.shutdown();
}
