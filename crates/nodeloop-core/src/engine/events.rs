//! Event plumbing — the supervisor pushes `Event`s to the host through a
//! channel; this module defines the shared sender alias and helpers.

use crate::types::Event;
use std::sync::mpsc::Sender;

/// Where the supervisor delivers lifecycle events.
pub type EventSink = Sender<Event>;

/// Loop-internal message: what the main loop reacts to.
#[derive(Debug)]
pub enum LoopEvent {
    /// A file changed (cwd-relative).
    Change(String),
    /// The supervised child exited: (code, signal-name).
    ChildExit(Option<i32>, Option<String>),
    /// A control command arrived from the host.
    Control(crate::types::Control),
}
