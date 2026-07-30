---
state: todo
priority: low
---

# Support more Home Assistant installation shapes

## Outcome

The bridge can serve supported users who cannot install the current
`aarch64`/`amd64` Home Assistant App.

## Work

- Confirm demand and runtime support before adding more Home Assistant
  architectures.
- Package the same bridge as a standalone container for Home Assistant
  Container/Core users, using an explicitly supplied Home Assistant URL and
  token.
- Add bounded camera snapshot transfer only when a concrete use case requires
  media; do not place continuous media in the event stream.
- Keep one shared bridge implementation and document the different local
  authentication models.

## Done when

Each advertised installation method has a reproducible image, clear
least-privilege setup instructions, and an end-to-end smoke proof.
