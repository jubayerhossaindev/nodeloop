//! Configuration model (validation + normalization).

pub mod model;

pub use model::{
    DEFAULT_DELAY_MS, DEFAULT_EXTS, DEFAULT_IGNORES, DEFAULT_KILL_TIMEOUT_MS, RuntimeOptions,
    normalize_signal,
};
