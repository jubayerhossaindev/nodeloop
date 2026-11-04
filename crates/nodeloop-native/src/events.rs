//! Event JSON serialization — the bridge's ONLY job on the event path:
//! convert a `core::Event` into the exact JSON shape the TypeScript side
//! (`src/native/types.ts NativeEvent`) parses.

use nodeloop_core::Event;
use serde::Serialize;

/// The wire format — field names match `NativeEvent` in types.ts exactly.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum EventJson {
    #[serde(rename_all = "camelCase")]
    Change {
        file: String,
    },
    #[serde(rename_all = "camelCase")]
    Queued {
        file: String,
        wait: u64,
    },
    Debounced,
    #[serde(rename_all = "camelCase")]
    Restart {
        file: Option<String>,
        restarts: u32,
    },
    Stopping,
    #[serde(rename_all = "camelCase")]
    Spawn {
        restarts: u32,
    },
    #[serde(rename_all = "camelCase")]
    SpawnError {
        message: String,
        code: Option<String>,
        path: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    Exit {
        code: Option<i32>,
        signal: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    Crash {
        code: Option<i32>,
    },
    #[serde(rename_all = "camelCase")]
    Error {
        message: String,
    },
    Stopped,
}

impl From<Event> for EventJson {
    fn from(event: Event) -> Self {
        match event {
            Event::Change { file } => EventJson::Change { file },
            Event::Queued { file, wait_ms } => EventJson::Queued {
                file,
                wait: wait_ms,
            },
            Event::Debounced => EventJson::Debounced,
            Event::Restart { file, restarts } => EventJson::Restart { file, restarts },
            Event::Stopping => EventJson::Stopping,
            Event::Spawn { restarts } => EventJson::Spawn { restarts },
            Event::SpawnError {
                message,
                code,
                path,
            } => EventJson::SpawnError {
                message,
                code,
                path,
            },
            Event::Exit { code, signal } => EventJson::Exit { code, signal },
            Event::Crash { code } => EventJson::Crash { code },
            Event::Error { message } => EventJson::Error { message },
            Event::Stopped => EventJson::Stopped,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wire_shapes_match_typescript_contract() {
        let json = serde_json::to_string(&EventJson::from(Event::Change {
            file: "app.js".into(),
        }))
        .unwrap();
        assert_eq!(json, r#"{"type":"change","file":"app.js"}"#);

        let json = serde_json::to_string(&EventJson::from(Event::Queued {
            file: "a.js".into(),
            wait_ms: 120,
        }))
        .unwrap();
        assert_eq!(json, r#"{"type":"queued","file":"a.js","wait":120}"#);

        let json = serde_json::to_string(&EventJson::from(Event::Restart {
            file: None,
            restarts: 3,
        }))
        .unwrap();
        assert_eq!(json, r#"{"type":"restart","file":null,"restarts":3}"#);

        let json = serde_json::to_string(&EventJson::from(Event::SpawnError {
            message: "spawn tsx ENOENT".into(),
            code: Some("ENOENT".into()),
            path: Some("app.ts".into()),
        }))
        .unwrap();
        assert_eq!(
            json,
            r#"{"type":"spawnError","message":"spawn tsx ENOENT","code":"ENOENT","path":"app.ts"}"#
        );

        let json = serde_json::to_string(&EventJson::from(Event::Exit {
            code: Some(1),
            signal: None,
        }))
        .unwrap();
        assert_eq!(json, r#"{"type":"exit","code":1,"signal":null}"#);
    }

    #[test]
    fn every_event_variant_serializes_to_its_tagged_shape() {
        // exhaust the From<Event> match — every arm produces the exact JSON
        // the TS NativeEvent discriminated union expects
        assert_eq!(
            serde_json::to_string(&EventJson::from(Event::Debounced)).unwrap(),
            r#"{"type":"debounced"}"#
        );
        assert_eq!(
            serde_json::to_string(&EventJson::from(Event::Restart {
                file: Some("a.js".into()),
                restarts: 1,
            }))
            .unwrap(),
            r#"{"type":"restart","file":"a.js","restarts":1}"#
        );
        assert_eq!(
            serde_json::to_string(&EventJson::from(Event::Stopping)).unwrap(),
            r#"{"type":"stopping"}"#
        );
        assert_eq!(
            serde_json::to_string(&EventJson::from(Event::Spawn { restarts: 0 })).unwrap(),
            r#"{"type":"spawn","restarts":0}"#
        );
        assert_eq!(
            serde_json::to_string(&EventJson::from(Event::SpawnError {
                message: "boom".into(),
                code: None,
                path: None,
            }))
            .unwrap(),
            r#"{"type":"spawnError","message":"boom","code":null,"path":null}"#
        );
        assert_eq!(
            serde_json::to_string(&EventJson::from(Event::Exit {
                code: None,
                signal: Some("SIGTERM".into()),
            }))
            .unwrap(),
            r#"{"type":"exit","code":null,"signal":"SIGTERM"}"#
        );
        assert_eq!(
            serde_json::to_string(&EventJson::from(Event::Crash { code: Some(2) })).unwrap(),
            r#"{"type":"crash","code":2}"#
        );
        assert_eq!(
            serde_json::to_string(&EventJson::from(Event::Error {
                message: "watch failed".into(),
            }))
            .unwrap(),
            r#"{"type":"error","message":"watch failed"}"#
        );
        assert_eq!(
            serde_json::to_string(&EventJson::from(Event::Stopped)).unwrap(),
            r#"{"type":"stopped"}"#
        );
    }

    #[test]
    fn event_json_is_debug_cloneable() {
        // the host bridge logs + clones event envelopes — keep the derives alive
        let ej = EventJson::from(Event::Spawn { restarts: 1 });
        let cloned = ej.clone();
        assert_eq!(
            serde_json::to_string(&ej).unwrap(),
            serde_json::to_string(&cloned).unwrap()
        );
        let _ = format!("{ej:?}");
    }
}
