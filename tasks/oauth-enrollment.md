---
state: todo
priority: medium
---

# Replace the project secret with guided enrollment

## Outcome

A Home Assistant user can connect the app from its UI without manually
revealing a long-lived whole-project secret.

## Work

- Add a small Home Assistant ingress UI with a one-time Iterate enrollment
  flow.
- Prefer device authorization or OAuth with a callback owned by the app.
- Issue a revocable installation credential scoped to one project, ITX mount,
  and stream.
- Show connection status, Rotate, and Disconnect controls.
- Keep project-secret configuration as an explicitly marked development
  fallback until migration is complete.

## Done when

Revoking the installation removes Iterate access without rotating unrelated
project credentials, and no Iterate browser cookie or OAuth token is written
to logs or ordinary app configuration.
