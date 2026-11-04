<!-- markdownlint-disable MD041 -->

name: Feature Request
description: Suggest a new feature or enhancement
title: "[FEAT] "
labels: ["enhancement", "needs-triage"]
body:

- type: markdown
  attributes:
  value: "Have a great idea for nodeloop? Tell us about it."
- type: textarea
  attributes:
  label: "Problem"
  description: "Is your feature request related to a problem? Please describe."
  placeholder: "I'm always frustrated when..."
  validations:
  required: true
- type: textarea
  attributes:
  label: "Proposed Solution"
  description: "Describe the solution you'd like"
  placeholder: "I'd like nodeloop to..."
  validations:
  required: true
- type: textarea
  attributes:
  label: "Alternatives Considered"
  description: "Describe any alternative solutions or features you've considered"
  placeholder: "You could..."
  validations:
  required: false
