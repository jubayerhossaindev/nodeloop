//! The change filter — an exact port of `Watcher.matches()` from
//! `lib/watch.js`: watch-scope prefixes → extension set → ignore segments
//! (case-insensitive matching; a leading dot is part of the name).

use std::collections::HashSet;
use std::path::Path;

/// Precomputed filter built from validated runtime options.
#[derive(Debug, Clone)]
pub struct Filter {
    exts: HashSet<String>,
    ignores: HashSet<String>,
    watch_paths: Vec<String>,
}

impl Filter {
    pub fn new(exts: &[String], ignores: &[String], watch_paths: Vec<String>) -> Self {
        Self {
            exts: exts.iter().cloned().collect(),
            // matching is CASE-INSENSITIVE (Windows paths, user input) —
            // the original spelling lives in the display list, not here
            ignores: ignores.iter().map(|i| i.to_lowercase()).collect(),
            watch_paths,
        }
    }

    /// Does a cwd-relative path pass the scope + ext + ignore filters?
    /// The path uses `/` separators; matching mirrors the JS semantics.
    pub fn matches(&self, rel_path: &str) -> bool {
        let rel = rel_path.replace('\\', "/");

        // watch scope: rel == prefix or rel starts with prefix + "/"
        if !self.watch_paths.is_empty()
            && !self
                .watch_paths
                .iter()
                .any(|p| rel == *p || rel.starts_with(&format!("{p}/")))
        {
            return false;
        }

        // extension filter
        if !self.exts.is_empty() {
            let ext = Path::new(&rel)
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_default();
            if !self.exts.contains(&ext) {
                return false;
            }
        }

        // ignore: ANY path segment matching (case-insensitive)
        !rel.split('/')
            .any(|seg| self.ignores.contains(&seg.to_lowercase()))
    }

    /// Is this single path segment (a directory name) ignored? Used by the
    /// polling scan to prune whole trees before descending.
    pub fn ignores_segment(&self, segment: &str) -> bool {
        self.ignores.contains(&segment.to_lowercase())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn filter(exts: &[&str], ignores: &[&str], watch: &[&str]) -> Filter {
        Filter::new(
            &exts.iter().map(|s| s.to_string()).collect::<Vec<_>>(),
            &ignores.iter().map(|s| s.to_string()).collect::<Vec<_>>(),
            watch.iter().map(|s| s.to_string()).collect(),
        )
    }

    #[test]
    fn default_ext_list_covers_js_family() {
        let f = filter(&["js", "mjs", "cjs", "json"], &[], &[]);
        assert!(f.matches("app.js"));
        assert!(f.matches("data.json"));
        assert!(f.matches("x.CJS"));
        assert!(!f.matches("style.css"));
        assert!(!f.matches("app.ts"));
    }

    #[test]
    fn leading_dot_ignore_names_keep_their_dot() {
        // regression: dot-stripping here used to leak every .github/** and
        // .git/**.json change into restart triggers. The segment ".git" is
        // part of the NAME, so files under it must be filtered OUT.
        let f = filter(&["json"], &[".git"], &[]);
        assert!(
            !f.matches(".git/config.json"),
            "changes under .git must never match"
        );
        assert!(
            f.matches("git/config.json"),
            "a plain 'git' dir is not ignored"
        );
    }

    #[test]
    fn ignore_matching_is_case_insensitive_display_keeps_spelling() {
        let f = filter(&["js"], &["Uploads"], &[]);
        assert!(!f.matches("uploads/x.js"));
        assert!(!f.matches("UPLOADS/x.js"));
        assert!(f.matches("app.js"));
    }

    #[test]
    fn watch_scope_limits_restarts() {
        let f = filter(&["js"], &[], &["packages/api"]);
        assert!(f.matches("packages/api/index.js"));
        assert!(f.matches("packages/api/sub/deep/app.js"));
        // legacy parity: matches() only ever sees FILES — "packages/api"
        // itself carries extname "api" and is filtered out like any file
        assert!(!f.matches("packages/api"));
        assert!(!f.matches("packages/web/index.js"));
        assert!(
            !f.matches("packages/api-extra/index.js"),
            "prefix must end at a segment boundary"
        );
    }

    #[test]
    fn extensionless_files_never_match_when_exts_set() {
        let f = filter(&["js"], &[], &[]);
        assert!(!f.matches("Dockerfile"));
        assert!(!f.matches("README"));
    }

    #[test]
    fn empty_exts_pass_any_file_through() {
        // when no extensions are configured, the legacy Watcher watched EVERY
        // file — the supervisor preserves that behavior when exts == []
        let f = filter(&[], &["node_modules"], &[]);
        assert!(f.matches("Dockerfile"), "no ext filter = any file matches");
        assert!(f.matches("README.md"));
        assert!(f.matches("bin/run"));
        // ignores still apply
        assert!(!f.matches("node_modules/lib.js"));
    }

    #[test]
    fn backslashes_normalized_before_matching() {
        // Windows-style separators are normalized to '/' before the watch
        // scope and ignore checks run — same as the legacy Watcher
        let f = filter(&["js"], &["build"], &["src"]);
        assert!(
            f.matches("src\\app.js"),
            "backslash separator must still satisfy the watch scope"
        );
        assert!(
            !f.matches("build\\app.js"),
            "backslash separator must still hit the ignore list"
        );
    }

    #[test]
    fn ignores_segment_matches_case_insensitively() {
        // the polling scan prunes whole trees via this probe — verify the
        // case-insensitive contract used by walk()
        let f = filter(&["js"], &["Build"], &[]);
        assert!(f.ignores_segment("build"));
        assert!(f.ignores_segment("BUILD"));
        assert!(f.ignores_segment("BuIlD"));
        assert!(!f.ignores_segment("dist"));
    }
}
