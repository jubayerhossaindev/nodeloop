<!-- markdownlint-disable MD041 -->

name: Pull Request Template
description: Standard PR template for nodeloop contributions
title: "[PR] "
labels: ["needs-review"]
body:

- type: markdown
  attributes:
  value: "Thanks for contributing to nodeloop! Please fill out this template."
- type: checkboxes
  attributes:
  label: "Pre-flight checks"
  options: - label: "I read the contributing guide"
  required: true - label: "I added/updated tests for my change"
  required: true - label: "I ran `make check` (typecheck + lint + fmt)"
  required: true - label: "My commit follows Conventional Commits"
  required: true
- type: textarea
  attributes:
  label: "What changed"
  description: "Summary of the change and why"
  validations:
  required: true
- type: input
  attributes:
  label: "Related issue"
  description: "Link to the issue this PR resolves"
  placeholder: "<https://github.com/jubayerhossaindev/nodeloop/issues/>..."
  validations:
  required: false
