# Iterate Home Assistant

This app streams Home Assistant events into an Iterate project and mounts a
live Home Assistant capability there. It connects outward from Home Assistant,
so no public Home Assistant URL, inbound port, or separate Home Assistant
access token is required.

## Before you start

You need an Iterate project:

1. Open the project at [os.iterate.com](https://os.iterate.com).
2. Copy its slug from the project URL.
3. Open **Secrets → project-api-key → Reveal** and copy the value.

Treat that value like a password. Anyone who can use the project capability
can read Home Assistant state and invoke actions that your Home Assistant
installation permits.

## Configuration

| Option           | Example                  | Meaning                            |
| ---------------- | ------------------------ | ---------------------------------- |
| `iterate_url`    | `https://os.iterate.com` | Iterate deployment                 |
| `project_slug`   | `my-project`             | Iterate project slug               |
| `project_secret` | `…`                      | Project's `project-api-key` secret |
| `itx_path`       | `myHa`                   | Capability appears as `itx.myHa`   |
| `stream_path`    | `/home-assistant/main`   | Independent destination stream     |

`itx_path` is a dotted JavaScript path. Both `myHa` and `itx.myHa` configure
the same mount. `stream_path` must be an absolute Iterate stream path.

Start the app and open its log. A successful connection reports
`bridge session ready`. Then enable **Start on boot** and **Watchdog**.

## Live capability

The capability includes TypeScript declarations built from the official
[`home-assistant-js-websocket`](https://github.com/home-assistant/home-assistant-js-websocket)
types.

```ts
await itx.myHa.status();

const states = await itx.myHa.getStates();
const services = await itx.myHa.getServices();

await itx.myHa.callService(
  "light",
  "turn_on",
  { brightness_pct: 20, rgb_color: [0, 120, 255] },
  { entity_id: "light.example" },
);
```

`sendMessage` is the escape hatch for one-shot Home Assistant WebSocket
commands. Authentication and subscription commands are rejected because the
app owns that connection and forwards the event-bus subscription separately.

## Stream events

- `home-assistant/bridge-session-started`
- `home-assistant/state-snapshot`
- `home-assistant/event`

Each session starts with a chunked snapshot of current entity states. Live
events then retain the original Home Assistant event under `payload.event`,
plus the bridge session ID, receive timestamp, and session sequence.

Home Assistant deliberately excludes the high-volume `state_reported` event
from an unfiltered subscription. The stream therefore contains every normal
event Home Assistant offers to that subscription, not every device protocol
packet or media frame.

If either WebSocket disconnects, the app tears down the session and reconnects
both sides. A new session marker and state snapshot make the discontinuity
visible. Events that occur while the app is offline are not recovered by this
proof of concept.

## Security and data

Entity states and event data leave the Home Assistant host and are stored in
the configured Iterate project. Depending on your integrations, this can
include presence, security, location, and environmental data.

The app requests only Home Assistant Core API access. It does not request host
networking, device access, mounted Home Assistant configuration, or Supervisor
administration. The Supervisor token remains local and is never logged or sent
to Iterate.

For help, open an issue at
[iterate/home-assistant](https://github.com/iterate/home-assistant/issues).
Security reports should follow the repository's
[security policy](https://github.com/iterate/home-assistant/security/policy).
The app is licensed under
[Apache-2.0](https://github.com/iterate/home-assistant/blob/main/LICENSE).
