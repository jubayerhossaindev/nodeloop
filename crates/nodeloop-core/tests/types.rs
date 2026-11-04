//! Display/Debug coverage for the pure-data vocabulary types.

use nodeloop_core::error::CoreError;
use nodeloop_core::types::Event;

#[test]
fn core_error_display_covers_every_variant() {
    assert_eq!(
        CoreError::InvalidOptions("bad delay".into()).to_string(),
        "invalid options: bad delay"
    );
    assert_eq!(
        CoreError::Watcher("inotify limit".into()).to_string(),
        "watcher: inotify limit"
    );
    assert_eq!(
        CoreError::Process("kill failed".into()).to_string(),
        "process: kill failed"
    );
    assert_eq!(CoreError::Stopped.to_string(), "supervisor stopped");
    // Debug derives exist for logging
    assert!(format!("{:?}", CoreError::Stopped).contains("Stopped"));
}

#[test]
fn event_display_covers_every_variant() {
    let cases: Vec<(Event, &str)> = vec![
        (
            Event::Change {
                file: "a.js".into(),
            },
            "change a.js",
        ),
        (
            Event::Queued {
                file: "a.js".into(),
                wait_ms: 200,
            },
            "queued a.js (200ms)",
        ),
        (Event::Debounced, "debounced"),
        (
            Event::Restart {
                file: Some("a.js".into()),
                restarts: 3,
            },
            "restart #3 (a.js)",
        ),
        (
            Event::Restart {
                file: None,
                restarts: 1,
            },
            "restart #1 (manual)",
        ),
        (Event::Stopping, "stopping"),
        (Event::Spawn { restarts: 2 }, "spawn #2"),
        (
            Event::SpawnError {
                message: "spawn x ENOENT".into(),
                code: Some("ENOENT".into()),
                path: Some("/x".into()),
            },
            "spawn error: spawn x ENOENT",
        ),
        (
            Event::SpawnError {
                message: "boom".into(),
                code: None,
                path: None,
            },
            "spawn error: boom",
        ),
        (
            Event::Exit {
                code: Some(0),
                signal: None,
            },
            "exit code=Some(0) signal=None",
        ),
        (
            Event::Exit {
                code: None,
                signal: Some("SIGTERM".into()),
            },
            r#"exit code=None signal=Some("SIGTERM")"#,
        ),
        (Event::Crash { code: Some(3) }, "crash code=Some(3)"),
        (
            Event::Error {
                message: "watch failed".into(),
            },
            "error: watch failed",
        ),
        (Event::Stopped, "stopped"),
    ];
    for (ev, expected) in cases {
        assert_eq!(ev.to_string(), expected, "display mismatch for {ev:?}");
        let _ = format!("{ev:?}"); // Debug derives stay available
        let _ = ev.clone(); // Clone derives stay available
    }
}

#[test]
fn event_equality_is_structural() {
    assert_eq!(
        Event::Change {
            file: "a.js".into()
        },
        Event::Change {
            file: "a.js".into()
        }
    );
    assert_ne!(
        Event::Change {
            file: "a.js".into()
        },
        Event::Change {
            file: "b.js".into()
        }
    );
}
