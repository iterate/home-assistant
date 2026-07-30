---
state: todo
priority: high
---

# Publish a stable, lean Iterate Node SDK

## Outcome

The app depends on a normal npm release that exports `iterate/node` without
pulling the browser CLI, React, or terminal UI dependency graph into the image.

## Work

- Publish the current Node client and generated ITX contract from the Iterate
  repository as a supported npm export or small dedicated package.
- Export the canonical capability-path parser so remote apps do not duplicate
  Iterate's reserved-segment policy.
- Switch this app from the immutable `pkg.pr.new` preview to an exact stable
  version.
- Compare the production image size and dependency audit before and after.

## Done when

A clean checkout builds without a preview package service and `pnpm audit
--prod` has no unexplained findings.
