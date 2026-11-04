//! The N-API binding surface — `#[napi]` export shims ONLY.
//!
//! Every function here is a thin adapter: parse args → call the pure
//! counterpart in `lib.rs`/`nodeloop-core` → lift the error into a napi
//! `Status`. No business logic lives in this file by design.
//!
//! Coverage note: this file is excluded from line-coverage metrics
//! (`cargo llvm-cov --ignore-filename-regex napi_bridge`). Two reasons,
//! both inherent to the N-API ABI layer:
//!   1. napi-derive generates registration shims (`__napi_rs_internal_
//!      register_*`, ctor trampolines, TSFN callback glue) around every
//!      export. Their standalone code records never receive counter hits —
//!      on Linux the exports register through a static table consumed by
//!      `napi_register_module_v1`, so the per-fn registration thunks are
//!      dead code by design. No Rust-side test can execute them and no
//!      stable-rustc `#[coverage(off)]` exists to mark them.
//!   2. The wrappers themselves require a live `napi_env`/`ThreadsafeFunction`
//!      — they can only execute inside a real Node runtime. Their behavior
//!      IS verified end-to-end, assertion by assertion, by the Node-driven
//!      integration test `tests/native_api.rs` (16 assertions across every
//!      export, including the error paths). Every piece of logic that CAN
//!      run without JS lives in the pure functions of `lib.rs`, which are
//!      unit-tested to 100% there.

use std::sync::Arc;

use napi::bindgen_prelude::*;
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi_derive::napi;

use nodeloop_core::Supervisor;

use crate::events::EventJson;
use crate::{
    CoreInfo, core_info_impl, lock_callbacks, lock_registry, next_id, parse_config_json,
    resolve_spawn_pure, watcher_stop_pure, with_supervisor_pure, write_stdin_call,
};
use nodeloop_core as core;

/// Report the core version — lets the TS layer verify the binary contract.
#[inline(never)]
#[napi]
pub fn core_version() -> String {
    core::VERSION.to_string()
}

/// Start a supervised watcher. `on_event` receives ONE JSON string per
/// lifecycle event. Returns the instance id used by every other call.
///
/// napi-rs v3: the `#[napi]` macro converts the JS function argument into a
/// referenced, unbounded `ThreadsafeFunction` directly — no manual
/// `create_threadsafe_function` call, no `JsFunction`/`Env` in the signature.
/// With the default `CalleeHandled = true` the JS callback receives
/// `(null, json)` — the TS client's wrapper drops the leading null.
#[napi]
pub fn watcher_start(
    config_json: String,
    on_event: Arc<ThreadsafeFunction<String, ()>>,
) -> Result<u32> {
    let options = parse_config_json(&config_json).map_err(|e| Error::new(Status::InvalidArg, e))?;

    // One forwarder thread calls the JS callback for every event; each
    // event string becomes the callback's single (post-`null`) argument.
    let callback_caller = Arc::clone(&on_event);
    let (event_tx, event_rx) = std::sync::mpsc::channel::<core::Event>();
    std::thread::spawn(move || {
        for event in event_rx {
            let json = serde_json::to_string(&EventJson::from(event)).unwrap_or_default();
            callback_caller.call(Ok(json), ThreadsafeFunctionCallMode::NonBlocking);
        }
    });

    let supervisor = Supervisor::start(options, event_tx)
        .map_err(|e| Error::new(Status::GenericFailure, e.to_string()))?;

    let id = next_id();
    lock_registry()
        .map_err(|e| Error::new(Status::GenericFailure, e))?
        .insert(id, supervisor);
    lock_callbacks()
        .map_err(|e| Error::new(Status::GenericFailure, e))?
        .insert(id, on_event);
    Ok(id)
}

/// Map a `watcher_stop_pure` error string to the napi status the host sees:
/// unknown id → InvalidArg (caller passed a bad handle); poisoned registry
/// → GenericFailure (the host can't recover). Extracted so both branches
/// are unit-testable without a JS runtime.
fn stop_error_status(e: &str) -> Status {
    if e.contains("is not running") {
        Status::InvalidArg
    } else {
        Status::GenericFailure
    }
}

/// Stop the watcher and kill its child; the registry entry is dropped.
#[napi]
pub fn watcher_stop(id: u32) -> Result<()> {
    watcher_stop_pure(id).map_err(|e| Error::new(stop_error_status(&e), e))
}

/// Manual restart — accounted as its own restart with no blamed file.
#[napi]
pub fn watcher_restart(id: u32) -> Result<()> {
    with_supervisor_pure(id, &crate::restart_call)
        .map(|_| ())
        .map_err(|e| Error::new(Status::GenericFailure, e.as_string()))
}

/// Write to the current child's stdin; false = no live child accepted it.
#[napi]
pub fn watcher_write_stdin(id: u32, data: Buffer) -> Result<bool> {
    let call = write_stdin_call(data.to_vec());
    with_supervisor_pure(id, &call).map_err(|e| Error::new(Status::GenericFailure, e.as_string()))
}

/// Whether the supervised child is alive right now.
#[napi]
pub fn watcher_child_alive(id: u32) -> Result<bool> {
    with_supervisor_pure(id, &crate::child_alive_call)
        .map_err(|e| Error::new(Status::GenericFailure, e.as_string()))
}

/// Pure spawn-spec resolver — the Windows/POSIX matrix, testable from TS.
#[napi]
pub fn resolve_spawn(
    exec: String,
    node_args: Vec<String>,
    script: Option<String>,
    script_args: Vec<String>,
    platform: Option<String>,
    node_path: String,
) -> Result<serde_json::Value> {
    let spec = resolve_spawn_pure(
        &exec,
        &node_args,
        script.as_deref(),
        &script_args,
        platform.as_deref(),
        &node_path,
    );
    Ok(serde_json::json!({
        "file": spec.file,
        "args": spec.args,
        "shell": spec.shell,
    }))
}

/// Diagnostics for contract tests. Built with `json!` — a two-string object
/// cannot fail to serialize, so the wrapper stays infallible.
#[inline(never)]
#[napi]
pub fn core_info() -> Result<serde_json::Value> {
    let info: CoreInfo = core_info_impl();
    Ok(serde_json::json!({
        "version": info.version,
        "platform": info.platform,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stop_error_status_maps_both_branches() {
        // unknown id → InvalidArg (the caller passed a stale handle);
        // anything else (poisoned registry) → GenericFailure
        assert_eq!(
            stop_error_status("watcher 7 is not running"),
            Status::InvalidArg
        );
        assert_eq!(
            stop_error_status("watcher registry poisoned"),
            Status::GenericFailure
        );
    }
}
