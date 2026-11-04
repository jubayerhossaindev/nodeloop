// commitlint.config.js — conventional commits enforcement (ESM)
// https://commitlint.js.org/reference/configuration

const PRESET_CONFIG = {
  types: [
    { type: 'build', section: 'Build System' },
    { type: 'chore', section: 'Chores' },
    { type: 'ci', section: 'CI/CD' },
    { type: 'docs', section: 'Documentation' },
    { type: 'feat', section: 'Features' },
    { type: 'fix', section: 'Bug Fixes' },
    { type: 'perf', section: 'Performance Improvements' },
    { type: 'refactor', section: 'Refactors' },
    { type: 'revert', section: 'Reverts' },
    { type: 'style', section: 'Styles' },
    { type: 'test', section: 'Tests' },
    { type: 'deps', section: 'Dependencies' },
    { type: 'security', section: 'Security' },
    { type: 'wip', section: 'Work in Progress' }
  ]
};

export default {
  extends: ['@commitlint/config-conventional'],
  parserPreset: {
    name: 'conventional-changelog-conventionalcommits',
    presetConfig: PRESET_CONFIG
  },
  defaultIgnores: true,
  helpUrl: 'https://www.conventionalcommits.org/',
  rules: {
    // ============================================================
    // Commit Type Rules
    // ============================================================

    'type-enum': [
      2,
      'always',
      [
        'build', // বিল্ড সিস্টেম বা এক্সটার্নাল ডিপেনডেন্সি পরিবর্তন
        'chore', // সোর্স বা টেস্ট ফাইল ছাড়া অন্যান্য সাধারণ কাজ
        'ci', // CI/CD কনফিগারেশন সম্পর্কিত পরিবর্তন
        'docs', // শুধু ডকুমেন্টেশন পরিবর্তন
        'feat', // নতুন ফিচার যোগ করা
        'fix', // বাগ ফিক্স করা
        'perf', // পারফরম্যান্স উন্নত করা
        'refactor', // বাগ ফিক্স বা নতুন ফিচার ছাড়া কোডের কাঠামো পরিবর্তন
        'revert', // আগের কোনো commit rollback করা
        'style', // কোডের formatting বা style পরিবর্তন
        'test', // টেস্ট ফাইল যোগ বা আপডেট করা
        'deps', // প্যাকেজ বা dependency আপডেট
        'security', // Security vulnerability বা security fix
        'wip' // চলমান কাজ (Work in Progress)
      ]
    ],

    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],

    // ============================================================
    // Commit Scope Rules
    // ============================================================

    'scope-enum': [
      2,
      'always',
      [
        'nodeloop-core', // Pure Rust Core Engine
        'nodeloop-native', // Rust N-API Native Binding
        'package', // Public npm package
        'repo', // Repository-level changes
        'ci', // CI/CD workflows
        'test', // Testing and coverage
        'tooling', // Development and verification tools
        'docs', // Documentation files
        'maintainers' // Maintenance and release guidelines
      ]
    ],

    'scope-empty': [2, 'never'],
    'scope-case': [2, 'always', 'kebab-case'],

    // ============================================================
    // Commit Header Rules
    // ============================================================

    'header-max-length': [2, 'always', 100],
    'header-trim': [2, 'always'],
    'header-full-stop': [2, 'never', '.'],

    // ============================================================
    // Commit Subject Rules
    // ============================================================

    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'subject-case': [2, 'always', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],

    // ============================================================
    // Commit Body Rules
    // ============================================================

    'body-leading-blank': [2, 'always'],
    // Release notes-এ দীর্ঘ generated lines থাকতে পারে।
    'body-max-line-length': [1, 'always', 120],

    // ============================================================
    // Commit Footer Rules
    // ============================================================

    'footer-leading-blank': [2, 'always'],
    // Automated release footer/notes-এর length সীমাবদ্ধ নয়।
    'footer-max-line-length': [1, 'always', 120]
  }
};
