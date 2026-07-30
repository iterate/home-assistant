# Iterate Home Assistant

This app opens Home Assistant's Supervisor-authorized WebSocket API, subscribes
to all normal Home Assistant events, and connects outbound to an Iterate
project. No Home Assistant URL, Home Assistant access token, inbound port, or
Iterate OAuth flow is required.

## Configuration

| Option           | Example                  | Meaning                                    |
| ---------------- | ------------------------ | ------------------------------------------ |
| `iterate_url`    | `https://os.iterate.com` | Iterate deployment                         |
| `project_slug`   | `my-project`             | Immutable Iterate project slug             |
| `project_secret` | `…`                      | Project's `/secrets/project-api-key` value |
| `itx_path`       | `myHa`                   | Live capability appears as `itx.myHa`      |
| `stream_path`    | `/home-assistant/main`   | Independent destination stream             |

`itx_path` is a dotted JavaScript path. Both `myHa` and `itx.myHa` configure the
same mount. `stream_path` is deliberately separate and must be an absolute
Iterate stream path.

The MVP intentionally uses only the project secret: it does not implement an
`auth.iterate.com` OAuth flow.

The app stops on invalid configuration or authentication. Transient network
and connection failures are retried with bounded backoff. A failed session is
explicitly represented by a `home-assistant/gap` event before the next state
snapshot; the bridge never grows an unbounded in-memory event queue.

## Live capability

The mount carries TypeScript declarations built from the official
`home-assistant-js-websocket` types, plus these instructions. Its primary
methods are:

```ts
await itx.myHa.status();
const states = await itx.myHa.getStates();
const services = await itx.myHa.getServices();

await itx.myHa.callService(
  "light",
  "turn_on",
  { rgb_color: [255, 0, 255], brightness_pct: 15 },
  { entity_id: "light.example" },
);
```

For a CeilSense, find the enabled entity whose friendly name is
`CeilSense Status LED`, call `light.turn_on` with a low brightness, and call
`light.turn_off` when the proof is complete. CeilSense Complete exposes 16 RGB
LEDs but no speaker. Avoid invoking calibration, factory reset, firmware
update, or restart buttons as a connectivity test.

`sendMessage` is an escape hatch for one-shot Home Assistant WebSocket
commands. Subscription and authentication commands are rejected; subscriptions
belong to the stream side of this app.

## Stream events

- `home-assistant/bridge-session-started`
- `home-assistant/event`
- `home-assistant/state-snapshot`
- `home-assistant/gap`

Each raw Home Assistant event is retained under `payload.event` and accompanied
by the bridge session id, receive timestamp, and monotonic session sequence.
Large snapshots are chunked. Idempotency keys are deterministic within a
session.

Home Assistant deliberately excludes the high-volume `state_reported` event
from an unfiltered `subscribe_events` subscription. All other events offered by
that subscription are forwarded.

The capability is live and session-bound. If either WebSocket goes away, the
mount goes away too; the app tears down the other side and establishes a fresh
session and state snapshot.

## Logs and data

Logs include connection state, configured paths, session ids, event counts, and
explicit failures. They never include the Iterate project secret or Home
Assistant Supervisor token.

The only persistent app data is a small bridge journal in `/data` used to report
an explicit gap after a process restart.

## Verified production proof

On 30 July 2026, version `0.1.0` was installed from this public repository on a
Home Assistant Green running Home Assistant `2026.7.4`. With:

- project `iterate`;
- mount `itx.myHa`;
- stream `/home-assistant/main`;

the app connected to production, published a 174-entity state snapshot, and
continued publishing raw Home Assistant events visible in both the Iterate
stream UI and API. Calls from the production Iterate REPL turned the CeilSense
status LEDs on and off. A final live query reported the LEDs on at RGB
`[0, 255, 80]` and 25% brightness.

## MVP boundaries

- Home Assistant Apps/Supervisor installations only.
- Project-secret authentication only; no Iterate OAuth.
- No `state_reported` events, because Home Assistant excludes them from an
  unfiltered event subscription.
- The capability exists only while both WebSocket connections are healthy.
- Commands are ordinary Home Assistant service calls; the app does not add a
  device-specific command model.
- No media, camera, or video transport.
