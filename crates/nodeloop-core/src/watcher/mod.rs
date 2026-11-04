//! Watcher module: backends, filter, path normalization.

pub mod backend;
pub mod filter;
pub mod paths;

#[cfg(target_os = "linux")]
pub use backend::InotifyBackend;
pub use backend::{PollingBackend, WatchBackend};
pub use filter::Filter;
pub use paths::{normalize_exts, normalize_ignores, normalize_watch_paths};

use crate::types::Backend;
use std::path::PathBuf;

/// Build the backend the options ask for (events → inotify on Linux with a
/// polling fallback if inotify is unavailable; polling → PollingBackend).
pub fn build_backend(opts: &crate::config::RuntimeOptions) -> Box<dyn WatchBackend> {
    let filter = Filter::new(&opts.exts, &opts.ignores, opts.watch_paths.clone());
    match opts.backend {
        Backend::Polling(ms) => Box::new(PollingBackend::new(PathBuf::from(&opts.cwd), filter, ms)),
        Backend::Events => {
            #[cfg(target_os = "linux")]
            {
                match InotifyBackend::new(PathBuf::from(&opts.cwd), filter) {
                    Some(b) => Box::new(b),
                    None => {
                        // inotify unavailable (limit exhausted) → degrade to
                        // polling at the classic 1s legacy interval
                        Box::new(PollingBackend::new(
                            PathBuf::from(&opts.cwd),
                            Filter::new(&opts.exts, &opts.ignores, opts.watch_paths.clone()),
                            1000,
                        ))
                    },
                }
            }
            #[cfg(not(target_os = "linux"))]
            {
                Box::new(PollingBackend::new(PathBuf::from(&opts.cwd), filter, 1000))
            }
        },
    }
}
