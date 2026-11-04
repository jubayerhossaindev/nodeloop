//! Path/extension/ignore normalization — the exact port of the legacy
//! normalizers in `lib/watch.js`.

/// Normalize watch-scope prefixes: absolute paths made cwd-relative,
/// `./` and trailing `/` trimmed, backslashes → `/`, dedup, case preserved.
/// `#[inline(never)]` keeps a standalone coverage record: the function is
/// small enough that inlining it into `RuntimeOptions::build` erases the
/// record and llvm-cov reports a never-called phantom instead.
#[inline(never)]
pub fn normalize_watch_paths(value: &[String], cwd: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for item in value {
        let mut s = item.trim().to_string();
        if s.is_empty() {
            continue;
        }
        let p = std::path::Path::new(&s);
        if p.is_absolute() {
            if let Ok(rel) = p.strip_prefix(cwd) {
                s = rel.to_string_lossy().replace('\\', "/");
            } else {
                s = s.replace('\\', "/");
            }
        }
        s = s.replace('\\', "/");
        while s.starts_with("./") {
            s = s[2..].to_string();
        }
        while s.ends_with('/') {
            s.pop();
        }
        if !s.is_empty() && !out.contains(&s) {
            out.push(s);
        }
    }
    out
}

/// Normalize extensions: trim, lowercase, strip one leading dot, drop blanks.
pub fn normalize_exts(value: &[String]) -> Vec<String> {
    value
        .iter()
        .map(|s| s.trim().to_lowercase())
        .map(|s| s.strip_prefix('.').unwrap_or(&s).to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

/// Normalize ignore names: keep the ORIGINAL spelling for display, match
/// case-insensitively, dedup case-insensitively (".git" must stay ".git").
#[inline(never)]
pub fn normalize_ignores(
    value: &[String],
) -> (
    Vec<String>, /* match set */
    Vec<String>, /* display */
) {
    let mut set: Vec<String> = Vec::new();
    let mut display: Vec<String> = Vec::new();
    for item in value {
        let s = item.trim().to_string();
        if s.is_empty() {
            continue;
        }
        let key = s.to_lowercase();
        if !set.contains(&key) {
            set.push(key);
            display.push(s);
        }
    }
    (set, display)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn watch_paths_trim_and_dedupe() {
        let v = vec![
            "./src/".to_string(),
            "src".to_string(),
            "lib".to_string(),
            String::new(),
        ];
        assert_eq!(normalize_watch_paths(&v, "/tmp"), vec!["src", "lib"]);
    }

    #[test]
    fn exts_strip_dots_and_lowercase() {
        let v = vec![".TS".to_string(), " JSON ".to_string(), String::new()];
        assert_eq!(normalize_exts(&v), vec!["ts", "json"]);
    }

    #[test]
    fn ignores_keep_dot_and_display() {
        let v = vec![".Git".to_string(), ".git".to_string(), "build".to_string()];
        let (set, display) = normalize_ignores(&v);
        assert_eq!(set, vec![".git", "build"]);
        assert_eq!(display, vec![".Git", "build"]);
    }

    #[test]
    fn absolute_paths_under_cwd_become_relative() {
        // absolute path inside cwd → strip the cwd prefix, normalize separators
        let cwd = std::env::temp_dir().to_string_lossy().to_string();
        let abs_inside = format!("{cwd}/src/api");
        let v = vec![abs_inside];
        assert_eq!(normalize_watch_paths(&v, &cwd), vec!["src/api"]);
    }

    #[test]
    fn absolute_paths_outside_cwd_stay_absolute() {
        // an absolute path NOT under cwd survives (legacy parity: such paths
        // are watched from their root, not cwd-relative)
        let cwd = std::env::temp_dir().to_string_lossy().to_string();
        let outside = "/var/log/nodeloop";
        let v = vec![outside.to_string()];
        let out = normalize_watch_paths(&v, &cwd);
        assert_eq!(out, vec!["/var/log/nodeloop"]);
    }

    #[test]
    fn backslash_separators_normalized_to_forward_slash() {
        // Windows-style watch paths reach the watcher with '/' separators
        let v = vec!["src\\api\\".to_string()];
        assert_eq!(normalize_watch_paths(&v, "/tmp"), vec!["src/api"]);
    }

    #[test]
    fn ignores_skip_blank_entries() {
        // a blank entry in the ignore list must not become an empty match-all
        let v = vec![String::new(), "   ".to_string(), "build".to_string()];
        let (set, display) = normalize_ignores(&v);
        assert_eq!(set, vec!["build"]);
        assert_eq!(display, vec!["build"]);
    }

    #[test]
    fn exts_strip_only_one_leading_dot() {
        // a literal ".hidden.ts" extension would be wrong; only ONE leading
        // dot is stripped (matching the legacy normalizer)
        let v = vec!["..ts".to_string()];
        assert_eq!(normalize_exts(&v), vec![".ts"]);
    }
}
