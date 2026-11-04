//! Process module: command resolution, signals, tree kill.

pub mod command;
pub mod signals;
pub mod supervisor;
pub mod tree;

pub use command::{
    SpawnSpec, SpawnedChild, resolve_spawn, spawn_child, tokenize_command, win_quote,
};
pub use tree::kill_tree;
