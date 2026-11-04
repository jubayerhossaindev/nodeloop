//! The runtime configuration model — every field the supervisor needs,
//! with validation mirroring the JS loader (`lib/config.js` sanitize +
//! `lib/watch.js` constructor defaults).

use crate::error::CoreError;
use crate::types::Backend;

/// Default watched extensions (no config).
pub const DEFAULT_EXTS: &[&str] = &["js", "mjs", "cjs", "json"];

/// Directory names always ignored, on top of the user's list.
pub const DEFAULT_IGNORES: &[&str] = &["node_modules", ".git", ".npm", "coverage", ".DS_Store"];

/// Default debounce window (ms).
pub const DEFAULT_DELAY_MS: u64 = 200;

/// Default kill-signal escalation window (ms).
pub const DEFAULT_KILL_TIMEOUT_MS: u64 = 3000;

/// Fully validated supervisor options.
#[derive(Debug, Clone)]
pub struct RuntimeOptions {
    /// Absolute script path, `None` for exec-only runs.
    pub script: Option<String>,
    pub script_args: Vec<String>,
    pub cwd: String,
    /// Command to run; `None` → the running node binary path.
    pub exec: Option<String>,
    pub node_args: Vec<String>,
    /// Lowercase extensions without dots (empty → DEFAULT_EXTS).
    pub exts: Vec<String>,
    /// Lowercased ignore segment set (already includes DEFAULT_IGNORES).
    pub ignores: Vec<String>,
    /// Watch-scope prefixes relative to cwd, `/`-normalized (empty = root).
    pub watch_paths: Vec<String>,
    pub delay_ms: u64,
    /// 0 = disabled (no force restart during bursts).
    pub max_wait_ms: u64,
    /// Signal name used to stop the child (e.g. "SIGTERM").
    pub kill_signal: String,
    pub kill_timeout_ms: u64,
    /// Events or polling backend.
    pub backend: Backend,
    /// Extra environment merged over the inherited environment.
    pub env: Vec<(String, String)>,
    /// Pipe the child's stdin so the host can write into it.
    pub interactive_stdin: bool,
}

impl RuntimeOptions {
    /// Validate + normalize the raw inputs into runtime options.
    ///
    /// Mirrors the legacy invariants: positive delays, known signal names,
    /// extension/ignore normalization (leading dots stripped, lowercased).
    #[allow(clippy::too_many_arguments)]
    pub fn build(
        script: Option<String>,
        script_args: Vec<String>,
        cwd: String,
        exec: Option<String>,
        node_args: Vec<String>,
        exts: Vec<String>,
        mut ignores: Vec<String>,
        watch_paths: Vec<String>,
        delay_ms: Option<u64>,
        max_wait_ms: Option<u64>,
        kill_signal: Option<String>,
        kill_timeout_ms: Option<u64>,
        backend: Backend,
        env: Vec<(String, String)>,
        interactive_stdin: bool,
    ) -> Result<Self, CoreError> {
        if cwd.trim().is_empty() {
            return Err(CoreError::InvalidOptions("cwd must not be empty".into()));
        }

        let exts = if exts.is_empty() {
            DEFAULT_EXTS.iter().map(|s| s.to_string()).collect()
        } else {
            exts.into_iter()
                .map(|e| e.trim().to_lowercase().trim_start_matches('.').to_string())
                .filter(|e| !e.is_empty())
                .collect()
        };

        // defaults always merged in — same list the legacy Watcher built
        for d in DEFAULT_IGNORES {
            ignores.push((*d).to_string());
        }
        let ignores: Vec<String> = ignores
            .into_iter()
            .map(|i| i.trim().to_lowercase())
            .filter(|i| !i.is_empty())
            .collect();

        let delay_ms = delay_ms.unwrap_or(DEFAULT_DELAY_MS);
        if delay_ms == 0 {
            return Err(CoreError::InvalidOptions("delay must be > 0".into()));
        }
        let max_wait_ms = max_wait_ms.unwrap_or(0);
        let kill_signal = normalize_signal(kill_signal.as_deref())?;
        let kill_timeout_ms = kill_timeout_ms.unwrap_or(DEFAULT_KILL_TIMEOUT_MS);
        if kill_timeout_ms == 0 {
            return Err(CoreError::InvalidOptions("kill timeout must be > 0".into()));
        }
        if let Backend::Polling(ms) = backend
            && ms < 50
        {
            return Err(CoreError::InvalidOptions(
                "polling interval must be >= 50ms (legacyWatch contract)".into(),
            ));
        }

        Ok(Self {
            script,
            script_args,
            cwd,
            exec,
            node_args,
            exts,
            ignores,
            watch_paths,
            delay_ms,
            max_wait_ms,
            kill_signal,
            kill_timeout_ms,
            backend,
            env,
            interactive_stdin,
        })
    }
}

/// Normalize a signal name: `"SIGTERM"` / `"term"` / `"15"` → canonical
/// `"SIGTERM"`. Mirrors the JS loader's `os.constants.signals` membership
/// check (case-insensitive, uppercased) for the common signals.
pub fn normalize_signal(name: Option<&str>) -> Result<String, CoreError> {
    const SIGNALS: &[&str] = &[
        "SIGHUP",
        "SIGINT",
        "SIGQUIT",
        "SIGILL",
        "SIGABRT",
        "SIGFPE",
        "SIGKILL",
        "SIGSEGV",
        "SIGPIPE",
        "SIGALRM",
        "SIGTERM",
        "SIGUSR1",
        "SIGUSR2",
        "SIGCHLD",
        "SIGCONT",
        "SIGSTOP",
        "SIGTSTP",
        "SIGTTIN",
        "SIGTTOU",
        "SIGURG",
        "SIGXCPU",
        "SIGXFSZ",
        "SIGVTALRM",
        "SIGPROF",
        "SIGWINCH",
        "SIGIO",
        "SIGSYS",
        "SIGBREAK",
    ];
    let raw = match name {
        None => return Ok("SIGTERM".into()),
        Some(s) => s.trim().to_uppercase(),
    };
    if raw.is_empty() {
        return Ok("SIGTERM".into());
    }
    let candidate = if raw.starts_with("SIG") {
        raw.clone()
    } else {
        format!("SIG{raw}")
    };
    if SIGNALS.contains(&candidate.as_str()) {
        Ok(candidate)
    } else if raw.chars().all(|c| c.is_ascii_digit()) {
        // numeric signal — accepted as-is (the OS decides validity on delivery)
        Ok(raw)
    } else {
        Err(CoreError::InvalidOptions(format!(
            "unknown signal: {name:?}"
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts() -> RuntimeOptions {
        RuntimeOptions::build(
            Some("/tmp/app.js".into()),
            vec![],
            "/tmp".into(),
            None,
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
        .expect("valid")
    }

    #[test]
    fn defaults_match_legacy() {
        let o = opts();
        assert_eq!(o.delay_ms, 200);
        assert_eq!(o.max_wait_ms, 0);
        assert_eq!(o.kill_signal, "SIGTERM");
        assert_eq!(o.kill_timeout_ms, 3000);
        assert_eq!(o.exts, vec!["js", "mjs", "cjs", "json"]);
        assert!(o.ignores.contains(&"node_modules".to_string()));
        assert!(o.ignores.contains(&".git".to_string()));
    }

    #[test]
    fn empty_cwd_rejected() {
        assert!(matches!(
            RuntimeOptions::build(
                None,
                vec![],
                "  ".into(),
                None,
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
                false
            ),
            Err(CoreError::InvalidOptions(_))
        ));
        // valid input does not match the Err pattern — hits the `false` arm
        assert!(!matches!(
            RuntimeOptions::build(
                None,
                vec![],
                "/tmp".into(),
                None,
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
                false
            ),
            Err(CoreError::InvalidOptions(_))
        ));
    }

    #[test]
    fn delay_must_be_positive() {
        assert!(
            RuntimeOptions::build(
                None,
                vec![],
                "/tmp".into(),
                None,
                vec![],
                vec![],
                vec![],
                vec![],
                Some(0),
                None,
                None,
                None,
                Backend::Events,
                vec![],
                false
            )
            .is_err()
        );
    }

    #[test]
    fn polling_requires_at_least_50ms() {
        assert!(
            RuntimeOptions::build(
                None,
                vec![],
                "/tmp".into(),
                None,
                vec![],
                vec![],
                vec![],
                vec![],
                None,
                None,
                None,
                None,
                Backend::Polling(49),
                vec![],
                false
            )
            .is_err()
        );
        assert!(
            RuntimeOptions::build(
                None,
                vec![],
                "/tmp".into(),
                None,
                vec![],
                vec![],
                vec![],
                vec![],
                None,
                None,
                None,
                None,
                Backend::Polling(50),
                vec![],
                false
            )
            .is_ok()
        );
    }

    #[test]
    fn signal_normalization() {
        assert_eq!(normalize_signal(None).unwrap(), "SIGTERM");
        assert_eq!(normalize_signal(Some("sigterm")).unwrap(), "SIGTERM");
        assert_eq!(normalize_signal(Some(" term ")).unwrap(), "SIGTERM");
        assert_eq!(normalize_signal(Some("SIGKILL")).unwrap(), "SIGKILL");
        assert_eq!(normalize_signal(Some("9")).unwrap(), "9");
        assert!(normalize_signal(Some("NOTASIGNAL")).is_err());
        // blank signal falls back to SIGTERM (legacy parity: empty string
        // from config means "use the default")
        assert_eq!(normalize_signal(Some("   ")).unwrap(), "SIGTERM");
        assert_eq!(normalize_signal(Some("")).unwrap(), "SIGTERM");
    }

    #[test]
    fn invalid_signal_rejected_in_build() {
        // propagate normalize_signal's Err through the `?` operator in
        // RuntimeOptions::build (line 101) — not covered by direct
        // normalize_signal unit tests.
        assert!(
            RuntimeOptions::build(
                None,
                vec![],
                "/tmp".into(),
                None,
                vec![],
                vec![],
                vec![],
                vec![],
                None,
                None,
                Some("INVALID_SIGNAL_XYZ".to_string()),
                None,
                Backend::Events,
                vec![],
                false,
            )
            .is_err()
        );
    }

    #[test]
    fn kill_timeout_must_be_positive() {
        // legacy parity: killTimeout=0 disables the SIGKILL escalation, but
        // the supervisor still needs a positive window to bound the wait
        assert!(matches!(
            RuntimeOptions::build(
                None,
                vec![],
                "/tmp".into(),
                None,
                vec![],
                vec![],
                vec![],
                vec![],
                None,
                None,
                None,
                Some(0),
                Backend::Events,
                vec![],
                false,
            ),
            Err(CoreError::InvalidOptions(_))
        ));
        // any positive value is accepted (including 1ms — the host may want
        // an immediate SIGKILL fallback)
        assert!(
            RuntimeOptions::build(
                None,
                vec![],
                "/tmp".into(),
                None,
                vec![],
                vec![],
                vec![],
                vec![],
                None,
                None,
                None,
                Some(1),
                Backend::Events,
                vec![],
                false,
            )
            .is_ok()
        );
        // valid config does not match the Err pattern — hits the `false` arm
        assert!(!matches!(
            RuntimeOptions::build(
                None,
                vec![],
                "/tmp".into(),
                None,
                vec![],
                vec![],
                vec![],
                vec![],
                None,
                None,
                None,
                Some(1),
                Backend::Events,
                vec![],
                false,
            ),
            Err(CoreError::InvalidOptions(_))
        ));
    }

    #[test]
    fn max_wait_defaults_to_disabled_when_unspecified() {
        // the legacy default for maxWait is 0 (no burst cap) — config tests
        // rely on this exact behavior
        let o = RuntimeOptions::build(
            None,
            vec![],
            "/tmp".into(),
            None,
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
        .unwrap();
        assert_eq!(o.max_wait_ms, 0);
        // but an explicit value is honored
        let o = RuntimeOptions::build(
            None,
            vec![],
            "/tmp".into(),
            None,
            vec![],
            vec![],
            vec![],
            vec![],
            None,
            Some(750),
            None,
            None,
            Backend::Events,
            vec![],
            false,
        )
        .unwrap();
        assert_eq!(o.max_wait_ms, 750);
    }

    #[test]
    fn exts_normalized() {
        let o = RuntimeOptions::build(
            None,
            vec![],
            "/tmp".into(),
            None,
            vec![],
            vec![".TS".into(), " JSON ".into()],
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
        .unwrap();
        assert_eq!(o.exts, vec!["ts", "json"]);
    }
}
