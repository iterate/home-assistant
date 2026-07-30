# Iterate Home Assistant

Public Home Assistant app that bridges the local Home Assistant WebSocket API
to an Iterate project.

## Invariants

- The app runs entirely in Home Assistant user space. It needs only
  `homeassistant_api: true`; do not add host networking, device mounts, or
  Supervisor administrator access.
- Iterate authentication is a project secret. Never log it or the Supervisor
  token.
- `itx_path` and `stream_path` are independent configuration values.
- Home Assistant subscriptions are bounded. On any connection or queue failure,
  tear down both sides and record an explicit gap before starting a fresh
  snapshot session.
- Use the official `home-assistant-js-websocket` package and types.
- Use `iterate/node` for the Iterate connection and generated ITX contract.

## Commands

Run from `iterate_home_assistant/`:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Do not commit or publish credentials, captured Home Assistant events, or local
`/data/options.json` files.
