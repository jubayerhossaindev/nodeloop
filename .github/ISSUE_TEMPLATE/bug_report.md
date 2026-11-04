<!-- markdownlint-disable MD041 -->

name: Bug Report
description: File a bug report
title: "[BUG] "
labels: ["bug", "needs-triage"]
body:

- type: markdown
  attributes:
  value: "Thanks for reporting a bug in nodeloop!"
- type: textarea
  attributes:
  label: "Description"
  description: "What happened? What did you expect to happen?"
  placeholder: "Describe the bug..."
  validations:
  required: true
- type: input
  attributes:
  label: "Version"
  description: "Which version of nodeloop are you using?"
  placeholder: "1.0.0"
  validations:
  required: true
- type: input
  attributes:
  label: "Environment"
  description: "OS, Node.js version, Rust toolchain (if applicable)"
  placeholder: "e.g. macOS 15, Node 22, Rust 1.99"
  validations:
  required: true
- type: textarea
  attributes:
  label: "Steps to Reproduce"
  description: "Minimal steps to reproduce the issue"
  placeholder: | 1. Run `npx nodeloop ...` 2. ... 3. Observe error
  validations:
  required: true
- type: textarea
  attributes:
  label: "Relevant config"
  description: "nodeloop config file contents (redact secrets)"
  render: shell
  validations:
  required: false
