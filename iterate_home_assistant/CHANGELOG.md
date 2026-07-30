# Changelog

## 0.2.0

- Keep the proven snapshot, event stream, live capability, and reconnect loop
  while removing the prototype's unused durable gap machinery.
- Delegate Supervisor WebSocket authentication to the official Home Assistant
  JavaScript client.
- Make required credentials explicit before first start.
- Restore Home Assistant's default init process.

## 0.1.0

- Stream Home Assistant WebSocket events and chunked state snapshots to Iterate.
- Mount a typed live Home Assistant capability at a configurable project path.
- Authenticate to Iterate with a project secret.
- Support independent ITX and stream paths.
- Publish `aarch64` and `amd64` images.
