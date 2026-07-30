---
state: todo
priority: medium
---

# Harden delivery, privacy, and credential lifecycle

## Outcome

Users can understand and control what leaves their home, and operators have an
explicit delivery contract beyond the proof of concept's best-effort stream.

## Work

- Measure event volume and memory use on large, busy installations.
- Add opt-in event/entity filters and retention guidance for sensitive
  presence, security, and location data.
- Decide whether outage recovery needs a persistent local outbox, Recorder
  backfill, or only the existing fresh snapshot.
- If durable gaps are required, define and implement one small protocol with
  idempotent append keys.
- Add credential rotation, revocation, and disconnected-installation UX.
- Add a tested AppArmor profile and scheduled dependency/linter checks.

## Done when

Delivery guarantees, loss windows, privacy controls, and credential revocation
are documented and verified against production-shaped Home Assistant traffic.
