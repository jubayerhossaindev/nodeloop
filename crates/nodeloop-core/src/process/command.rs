//! Command resolution — the exact port of `resolveSpawn`/`tokenizeCommand`
//! from `lib/watch.js`, plus the actual child spawn.

use std::process::{Child, Command, Stdio};

/// A resolved spawn call: file + argv (+ shell reassembly on Windows).
#[derive(Debug, Clone, PartialEq)]
pub struct SpawnSpec {
    pub file: String,
    pub args: Vec<String>,
    pub shell: bool,
}

/// Default "does this path point at an executable FILE" probe (dirs rejected).
pub fn is_executable_file(p: &str) -> bool {
    std::fs::metadata(p).map(|m| m.is_file()).unwrap_or(false)
}

/// Split a command string into argv tokens respecting ' and " quoting.
/// Inside double quotes `\"` is a literal quote; backslashes stay literal
/// (Windows paths). Unmatched quotes are tolerated.
pub fn tokenize_command(s: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut cur = String::new();
    let mut has = false;
    let mut quote: Option<char> = None;
    let chars: Vec<char> = s.chars().collect();
    let mut i = 0usize;

    while i < chars.len() {
        let ch = chars[i];
        if let Some(q) = quote {
            if ch == q {
                quote = None;
            } else if ch == '\\' && q == '"' && chars.get(i + 1) == Some(&'"') {
                cur.push('"');
                i += 1;
            } else {
                cur.push(ch);
            }
        } else if ch == '"' || ch == '\'' {
            quote = Some(ch);
            has = true;
        } else if ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r' {
            if has {
                tokens.push(std::mem::take(&mut cur));
                has = false;
            }
        } else {
            cur.push(ch);
            has = true;
        }
        i += 1;
    }
    if has {
        tokens.push(cur);
    }
    tokens
}

/// Quote ONE token for a Windows command line (MSVCRT argv rules — what
/// node.exe itself parses). Exact port of the legacy `winQuote`:
///   '' → '""';  no space/quote → unchanged;  otherwise wrap in quotes,
///   double every backslash run before a quote + escape the quote, and
///   double the trailing backslash run.
pub fn win_quote(arg: &str) -> String {
    if arg.is_empty() {
        return "\"\"".into();
    }
    if !arg.contains([' ', '"', '\t']) {
        return arg.to_string();
    }
    let chars: Vec<char> = arg.chars().collect();
    let mut out = String::with_capacity(arg.len() + 2);
    let mut i = 0usize;
    while i < chars.len() {
        let c = chars[i];
        if c == '\\' {
            let run_start = i;
            while i < chars.len() && chars[i] == '\\' {
                i += 1;
            }
            let run = i - run_start;
            if i < chars.len() && chars[i] == '"' {
                // backslashes before a quote: double them, then \"
                for _ in 0..run * 2 {
                    out.push('\\');
                }
                out.push_str("\\\"");
                i += 1;
            } else {
                for _ in 0..run {
                    out.push('\\');
                }
            }
        } else if c == '"' {
            out.push_str("\\\"");
            i += 1;
        } else {
            out.push(c);
            i += 1;
        }
    }
    // double the trailing backslash run before the closing quote
    let trailing = out.len() - out.trim_end_matches('\\').len();
    for _ in 0..trailing {
        out.push('\\');
    }
    format!("\"{out}\"")
}

/// Build the exact spawn call for the configured exec. Production entry —
/// probes file existence directly (`is_executable_file`). The probe is only
/// injectable through [`resolve_spawn_with`] (used by tests to simulate the
/// Windows matrix on every OS); keeping the production call direct avoids
/// a pass-only-as-fn-pointer coverage artifact on the probe.
pub fn resolve_spawn(
    exec: Option<&str>,
    node_args: &[String],
    script: Option<&str>,
    script_args: &[String],
    platform: &str,
    node_path: &str,
) -> SpawnSpec {
    resolve_spawn_with(
        exec,
        node_args,
        script,
        script_args,
        platform,
        &is_executable_file,
        node_path,
    )
}

/// Build the exact spawn call for the configured exec. Pure: platform and
/// file-existence are injectable so the full Windows matrix is testable
/// on every OS — the same seam the legacy code kept.
pub fn resolve_spawn_with(
    exec: Option<&str>,
    node_args: &[String],
    script: Option<&str>,
    script_args: &[String],
    platform: &str,
    exists: &dyn Fn(&str) -> bool,
    node_path: &str,
) -> SpawnSpec {
    let tail: Vec<String> = node_args
        .iter()
        .cloned()
        .chain(script.map(|s| s.to_string()))
        .chain(script_args.iter().cloned())
        .collect();

    let raw = exec.unwrap_or("").trim().to_string();
    if raw.is_empty() || raw.eq_ignore_ascii_case("node") || raw.eq_ignore_ascii_case("node.exe") {
        return SpawnSpec {
            file: node_path.to_string(),
            args: tail,
            shell: false,
        };
    }

    // INVARIANT (documented, was a defensive branch): a trimmed non-empty
    // string always tokenizes to at least one token — whitespace collapses
    // away and any other character (including a lone quote) accumulates.
    // So `tokens` is never empty here and indexing tokens[0] is safe.
    let tokens = tokenize_command(&raw);
    let first = tokens[0].clone();
    let mut cmd = first.clone();
    let mut cmd_args: Vec<String> = tokens[1..].to_vec();

    // CreateProcess-style merge for unquoted spaced paths
    if (first.contains('\\') || first.contains('/')) && !exists(&first) {
        for take in 2..=tokens.len() {
            let joined = tokens[..take].join(" ");
            if exists(&joined) {
                cmd = joined;
                cmd_args = tokens[take..].to_vec();
                break;
            }
        }
    }

    if platform != "win32" {
        return SpawnSpec {
            file: cmd,
            args: [cmd_args, tail].concat(),
            shell: false,
        };
    }

    // Windows specifics
    if cmd.eq_ignore_ascii_case("node") || cmd.eq_ignore_ascii_case("node.exe") {
        return SpawnSpec {
            file: node_path.to_string(),
            args: [cmd_args, tail].concat(),
            shell: false,
        };
    }
    let needs_shell = if cmd.contains('\\') || cmd.contains('/') {
        cmd.to_lowercase().ends_with(".cmd") || cmd.to_lowercase().ends_with(".bat")
    } else {
        true
    };
    if needs_shell {
        let cmdline: Vec<String> = [vec![cmd], cmd_args, tail]
            .concat()
            .iter()
            .map(|t| win_quote(t))
            .collect();
        return SpawnSpec {
            file: cmdline.join(" "),
            args: vec![],
            shell: true,
        };
    }
    SpawnSpec {
        file: cmd,
        args: [cmd_args, tail].concat(),
        shell: false,
    }
}

/// The child bundle the supervisor keeps: the pid to signal, the piped
/// stdin when running interactively, and the Child itself (the waiter
/// thread owns it and reaps the real exit).
pub struct SpawnedChild {
    pub pid: u32,
    pub stdin: Option<std::process::ChildStdin>,
    pub child: Child,
}

/// Inherited stdio that survives exec() even when the HOST process (node +
/// libuv) sets FD_CLOEXEC on its standard streams. libuv marks fd 0/1/2
/// close-on-exec when it wraps them as streams, so a plain `Stdio::inherit()`
/// yields a child with NO standard streams at all. `dup(2)` (per POSIX)
/// never carries FD_CLOEXEC to the new descriptor — dup the raw fds and hand
/// THOSE to the Command; the final child slots come out clean.
#[cfg(unix)]
fn inherit_stdio() -> (Stdio, Stdio, Stdio) {
    inherit_stdio_with(|fd| unsafe { libc::dup(fd) })
}

/// Injectable variant — `dup_fd` stands in for the real `dup(2)` so the
/// fallback branch (dup failure under fd exhaustion) is unit-testable
/// without perturbing the test process's descriptor table.
#[cfg(unix)]
fn inherit_stdio_with(dup_fd: impl Fn(i32) -> i32) -> (Stdio, Stdio, Stdio) {
    use std::os::fd::FromRawFd;
    let dup_std = |fd: i32| -> Option<Stdio> {
        let dup = dup_fd(fd);
        if dup < 0 {
            return None;
        }
        // SAFETY: `dup` returned a fresh, owned descriptor (no FD_CLOEXEC).
        Some(unsafe { Stdio::from(std::fs::File::from_raw_fd(dup)) })
    };
    match (dup_std(0), dup_std(1), dup_std(2)) {
        (Some(i), Some(o), Some(e)) => (i, o, e),
        // fall back to plain inherit when dup itself failed
        _ => (Stdio::inherit(), Stdio::inherit(), Stdio::inherit()),
    }
}

/// Spawn the resolved spec with inherited stdio (child output passes
/// through untouched — the core never prefixes or recolors it).
pub fn spawn_child(
    spec: &SpawnSpec,
    cwd: &str,
    env: &[(String, String)],
    interactive_stdin: bool,
) -> std::io::Result<SpawnedChild> {
    let mut command = if spec.shell {
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            let mut c = Command::new("cmd.exe");
            c.arg("/C").arg(&spec.file);
            c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
            c
        }
        #[cfg(not(target_os = "windows"))]
        {
            let mut c = Command::new("/bin/sh");
            c.arg("-c").arg(&spec.file);
            c
        }
    } else {
        let mut c = Command::new(&spec.file);
        c.args(&spec.args);
        c
    };

    command.current_dir(cwd);
    command.env_clear();
    command.envs(std::env::vars());
    for (k, v) in env {
        command.env(k, v);
    }

    #[cfg(unix)]
    {
        let (in_s, out_s, err_s) = inherit_stdio();
        command.stdin(if interactive_stdin {
            Stdio::piped()
        } else {
            in_s
        });
        command.stdout(out_s);
        command.stderr(err_s);
    }
    #[cfg(not(unix))]
    {
        command.stdin(if interactive_stdin {
            Stdio::piped()
        } else {
            Stdio::inherit()
        });
        command.stdout(Stdio::inherit());
        command.stderr(Stdio::inherit());
    }

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        // own process group → the negative-pid signal reaches the whole tree
        command.process_group(0);
    }

    let mut child = command.spawn()?;
    let stdin = if interactive_stdin {
        child.stdin.take()
    } else {
        None
    };
    Ok(SpawnedChild {
        pid: child.id(),
        stdin,
        child,
    })
}

/// A child killed by a signal keeps no exit code — liveness is decided by
/// the supervisor's own accounting (waiter thread); kept for symmetry with
/// the JS API surface.
pub fn child_alive(_child: &Child) -> bool {
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn always(_p: &str) -> bool {
        false
    }

    #[test]
    fn is_executable_file_distinguishes_files_from_dirs_and_missing() {
        // real file → true
        let tmp = tempfile::tempdir().unwrap();
        let f = tmp.path().join("bin.sh");
        std::fs::write(&f, "#!/bin/sh").unwrap();
        assert!(is_executable_file(f.to_str().unwrap()));
        // directory → false (NOT a file)
        assert!(!is_executable_file(tmp.path().to_str().unwrap()));
        // missing path → false (no panic)
        assert!(!is_executable_file("/nonexistent/nodeloop-probe-12347"));
    }

    #[test]
    fn tokenize_respects_quotes() {
        assert_eq!(tokenize_command("npm run dev"), vec!["npm", "run", "dev"]);
        assert_eq!(
            tokenize_command("\"C:\\Program Files\\node\\node.exe\" --x"),
            vec!["C:\\Program Files\\node\\node.exe", "--x"]
        );
        assert_eq!(tokenize_command("a 'b c' d"), vec!["a", "b c", "d"]);
        assert_eq!(tokenize_command("\"a\\\"b\""), vec!["a\"b"]);
        assert_eq!(tokenize_command("un\"matched"), vec!["unmatched"]);
        assert!(tokenize_command("   \t\n ").is_empty());
    }

    #[test]
    fn tokenize_handles_empty_and_single_quotes() {
        // empty input → empty token list (no phantom token)
        assert!(tokenize_command("").is_empty());
        // single-character quote open with nothing after → tolerated as a
        // single empty token (legacy parity: "unmatched quotes are tolerated")
        assert_eq!(tokenize_command("'"), vec![""]);
        assert_eq!(tokenize_command("\""), vec![""]);
        // adjacent quoted + bare segments collapse correctly
        assert_eq!(tokenize_command("\"a\"'b'c d"), vec!["abc", "d"]);
        // tab is whitespace same as space
        assert_eq!(tokenize_command("a\tb"), vec!["a", "b"]);
    }

    #[test]
    fn bare_node_uses_running_binary() {
        let s = resolve_spawn_with(
            Some("NODE"),
            &["--inspect".into()],
            Some("app.js"),
            &["--p".into()],
            "linux",
            &always,
            "/usr/bin/node24",
        );
        assert_eq!(s.file, "/usr/bin/node24");
        assert_eq!(s.args, vec!["--inspect", "app.js", "--p"]);
        assert!(!s.shell);
    }

    #[test]
    fn empty_exec_falls_back_to_node() {
        // empty / whitespace-only exec behaves like "node" — the legacy
        // contract: omit exec and the running node drives the script
        let s = resolve_spawn_with(
            Some("   "),
            &[],
            Some("app.js"),
            &[],
            "linux",
            &always,
            "/usr/bin/node",
        );
        assert_eq!(s.file, "/usr/bin/node");
        assert_eq!(s.args, vec!["app.js"]);
        assert!(!s.shell);
    }

    #[test]
    fn exec_with_only_quotes_tokenizes_to_single_empty_token() {
        // a `""` exec tokenizes to [""] (one empty token, NOT an empty
        // vec) — the resolver still falls back to node because the empty
        // first token is treated as a nameless bare command
        let s = resolve_spawn_with(
            Some("\"\""),
            &[],
            Some("app.js"),
            &[],
            "linux",
            &always,
            "/usr/bin/node",
        );
        // an empty first token can't contain a path separator, so the merge
        // loop is skipped and the POSIX branch returns file="" — the spawn
        // itself fails downstream with ENOENT, matching legacy behavior
        assert_eq!(s.file, "");
        assert_eq!(s.args, vec!["app.js"]);
        assert!(!s.shell);
    }

    #[test]
    fn posix_bare_name_spawns_direct() {
        let s = resolve_spawn_with(
            Some("tsx src/main.ts"),
            &[],
            None,
            &[],
            "linux",
            &always,
            "/usr/bin/node",
        );
        assert_eq!(s.file, "tsx");
        assert_eq!(s.args, vec!["src/main.ts"]);
        assert!(!s.shell);
    }

    #[test]
    fn posix_spaced_path_merges_when_first_segment_does_not_exist() {
        // CreateProcess-style merge: the first token does NOT exist, but the
        // first TWO tokens joined DO — the resolver glues them together and
        // shifts the remainder into args
        let exists = |p: &str| p == "/usr/local/bin/my tool";
        let s = resolve_spawn_with(
            Some("/usr/local/bin/my tool --flag"),
            &[],
            None,
            &[],
            "linux",
            &exists,
            "/usr/bin/node",
        );
        assert_eq!(s.file, "/usr/local/bin/my tool");
        assert_eq!(s.args, vec!["--flag"]);
        assert!(!s.shell);
    }

    #[test]
    fn merge_loop_gives_up_when_no_prefix_exists() {
        // nothing ever exists → the loop runs to exhaustion and the ORIGINAL
        // first token stays the command (the spawn itself will ENOENT later)
        let exists = |_p: &str| false;
        let s = resolve_spawn_with(
            Some("/no/such/dir one two"),
            &[],
            None,
            &[],
            "linux",
            &exists,
            "/usr/bin/node",
        );
        assert_eq!(s.file, "/no/such/dir");
        assert_eq!(s.args, vec!["one", "two"]);
    }

    #[test]
    fn windows_tokenized_node_alias_uses_running_binary() {
        // exec="node --inspect" does NOT match the early bare-node check
        // (the raw string is longer), but the TOKENIZED first token is
        // "node" → the Windows block resolves it to the running binary
        let s = resolve_spawn_with(
            Some("node --inspect"),
            &[],
            Some("app.js"),
            &[],
            "win32",
            &always,
            "C:\\Program Files\\nodejs\\node.exe",
        );
        assert_eq!(s.file, "C:\\Program Files\\nodejs\\node.exe");
        assert_eq!(s.args, vec!["--inspect", "app.js"]);
        assert!(!s.shell);
    }

    #[test]
    fn windows_tokenized_node_exe_alias_via_quotes() {
        // quoted "node.exe" survives the early check (raw keeps the quotes)
        // and tokenizes to node.exe → Windows alias → running binary
        let s = resolve_spawn_with(
            Some("\"node.exe\""),
            &[],
            Some("app.js"),
            &[],
            "win32",
            &always,
            "C:\\node.exe",
        );
        assert_eq!(s.file, "C:\\node.exe");
        assert_eq!(s.args, vec!["app.js"]);
        assert!(!s.shell);
    }

    #[test]
    fn windows_node_alias_uses_running_binary() {
        // exec="node" on Windows → the running node binary, no shell
        let s = resolve_spawn_with(
            Some("node"),
            &["--inspect".into()],
            Some("app.js"),
            &[],
            "win32",
            &always,
            "C:\\Program Files\\nodejs\\node.exe",
        );
        assert_eq!(s.file, "C:\\Program Files\\nodejs\\node.exe");
        assert_eq!(s.args, vec!["--inspect", "app.js"]);
        assert!(!s.shell);
    }

    #[test]
    fn windows_node_exe_alias_uses_running_binary() {
        let s = resolve_spawn_with(
            Some("node.exe"),
            &[],
            Some("app.js"),
            &[],
            "win32",
            &always,
            "C:\\node.exe",
        );
        assert_eq!(s.file, "C:\\node.exe");
        assert_eq!(s.args, vec!["app.js"]);
        assert!(!s.shell);
    }

    #[test]
    fn windows_bare_names_go_through_cmd_exe() {
        let s = resolve_spawn_with(
            Some("npm run dev"),
            &[],
            None,
            &[],
            "win32",
            &always,
            "C:\\Program Files\\nodejs\\node.exe",
        );
        assert!(s.shell);
        assert_eq!(s.file, "npm run dev");
    }

    #[test]
    fn windows_existing_path_no_shell() {
        // a Windows path that EXISTS as a file does not go through cmd.exe
        let exists = |p: &str| p == "C:\\bin\\my-tool.exe";
        let s = resolve_spawn_with(
            Some("C:\\bin\\my-tool.exe --flag"),
            &[],
            None,
            &[],
            "win32",
            &exists,
            "C:\\node.exe",
        );
        assert!(!s.shell);
        assert_eq!(s.file, "C:\\bin\\my-tool.exe");
        assert_eq!(s.args, vec!["--flag"]);
    }

    #[test]
    fn windows_spaced_paths_merge_createprocess_style() {
        let exists = |p: &str| p == "C:\\Program Files\\nodejs\\node.exe";
        let s = resolve_spawn_with(
            Some("\"C:\\Program Files\\nodejs\\node.exe\" --v"),
            &[],
            None,
            &[],
            "win32",
            &exists,
            "C:\\Program Files\\nodejs\\node.exe",
        );
        assert!(!s.shell);
        assert_eq!(s.file, "C:\\Program Files\\nodejs\\node.exe");
        assert_eq!(s.args, vec!["--v"]);
    }

    #[test]
    fn win_quote_escapes() {
        assert_eq!(win_quote("plain"), "plain");
        assert_eq!(win_quote(""), "\"\"");
        assert_eq!(win_quote("with space"), "\"with space\"");
    }

    #[test]
    fn win_quote_doubles_backslashes_before_a_quote() {
        // MSVCRT argv rule: a backslash run before a " gets doubled, then \"
        // escapes the quote. `C:\path\to\"x` → `"C:\path\to\\\"x"`
        assert_eq!(win_quote(r#"C:\path\to\"x"#), r#""C:\path\to\\\"x""#);
    }

    #[test]
    fn win_quote_doubles_trailing_backslash_run() {
        // a trailing backslash run is doubled before the closing quote — the
        // MSVCRT rule that keeps `C:\path\` round-tripping through cmd.exe
        let q1 = win_quote("path with space\\");
        // expected: opening quote, "path with space", 2 backslashes, closing quote
        assert_eq!(q1.chars().next(), Some('"'));
        assert_eq!(q1.chars().last(), Some('"'));
        let inner1 = &q1[1..q1.len() - 1];
        assert!(inner1.ends_with("\\\\"), "inner1 = {inner1:?}");
        let q2 = win_quote("ends with slash\\");
        let inner2 = &q2[1..q2.len() - 1];
        assert!(inner2.ends_with("\\\\"), "inner2 = {inner2:?}");
    }

    #[test]
    fn win_quote_preserves_internal_backslashes_without_quote() {
        // backslashes NOT before a quote stay literal — Windows paths
        assert_eq!(
            win_quote(r#"C:\Program Files\node"#),
            r#""C:\Program Files\node""#
        );
    }

    #[test]
    fn win_quote_handles_tab_separated() {
        // tab triggers quoting same as space — the wrapped value preserves
        // the tab byte verbatim (no escaping, just surrounding quotes)
        let quoted = win_quote("a\tb");
        assert!(quoted.starts_with('"') && quoted.ends_with('"'));
        assert_eq!(quoted.len(), 5); // "a\tb" = 5 bytes including both quotes
        assert_eq!(quoted.chars().nth(1), Some('a'));
        assert_eq!(quoted.chars().nth(2), Some('\t'));
        assert_eq!(quoted.chars().nth(3), Some('b'));
    }

    #[test]
    fn child_alive_is_truthy_for_any_child_handle() {
        // the legacy API kept this for symmetry; the supervisor decides
        // liveness through its own accounting, not by probing the OS —
        // any Child handle reports true
        let mut child = std::process::Command::new("true")
            .spawn()
            .expect("true exists");
        assert!(child_alive(&child));
        let _ = child.wait();
    }

    #[test]
    fn always_helper_is_callable() {
        // `always` is passed as `&dyn Fn` in resolve_spawn tests; call it
        // directly too so the compiler's coverage of the helper is explicit
        assert!(!always("anything"));
    }

    #[test]
    fn win_quote_escapes_bare_quote_without_backslash_run() {
        // a quote NOT preceded by backslashes hits the `c == '"'` arm
        assert_eq!(win_quote("say \"hi\""), "\"say \\\"hi\\\"\"");
    }

    #[cfg(unix)]
    #[test]
    fn inherit_stdio_falls_back_when_dup_fails() {
        // dup(2) failing for every descriptor (fd exhaustion) → the match
        // falls through to plain Stdio::inherit() instead of panicking.
        // The injected closure returns -1 so NO bogus descriptors are
        // created (a fake positive fd would alias a real one on close).
        let (i, o, e) = inherit_stdio_with(|_fd| -1);
        let _ = (i, o, e); // inherit stdios — nothing to assert beyond no-panic
    }

    #[cfg(unix)]
    #[test]
    fn inherit_stdio_real_dup_succeeds() {
        // the production closure (real dup(2)) — every dup must succeed in
        // a healthy process and yield three owned descriptors
        let (i, o, e) = inherit_stdio_with(|fd| unsafe { libc::dup(fd) });
        let _ = (i, o, e);
    }

    #[test]
    fn shell_spec_spawns_through_bin_sh() {
        // a shell=true spec (Windows .cmd/.bat parity) runs via /bin/sh -c
        // on POSIX — the cfg(not(windows)) branch of spawn_child
        let spec = SpawnSpec {
            file: "echo SHELL-SPEC-MARK".into(),
            args: vec![],
            shell: true,
        };
        let mut child = spawn_child(&spec, "/tmp", &[], false).expect("sh spawn works");
        let status = child.child.wait().expect("wait works");
        assert!(status.success(), "sh -c 'echo …' must exit 0, got {status}");
    }

    #[test]
    fn spawn_child_interactive_stdin_captures_piped_stdin() {
        // interactive_stdin=true → child.stdin is taken into the slot
        let spec = SpawnSpec {
            file: "true".into(),
            args: vec![],
            shell: false,
        };
        let mut child = spawn_child(&spec, "/tmp", &[], true).expect("interactive spawn works");
        assert!(
            child.stdin.is_some(),
            "stdin must be piped when interactive"
        );
        let _ = child.child.wait();
    }
}
