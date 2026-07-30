# Iterate Home Assistant

A minimal Home Assistant app that makes a Home Assistant instance available to
an Iterate project in two independent ways:

- every Home Assistant event is appended to a configured Iterate stream;
- a typed, documented, live capability is mounted at a configured ITX path.

The app uses Home Assistant's Supervisor token locally and a single Iterate
project secret remotely. It does not require Iterate OAuth, a config worker,
host networking, host devices, or privileged Supervisor access.

## Verified MVP

The public `0.1.0` image has been installed on a Home Assistant Green
(`aarch64`) and verified against `https://os.iterate.com`. The app streamed a
174-entity initial snapshot and subsequent live events, mounted `itx.myHa`, and
controlled a CeilSense's 16 RGB status LEDs through the Iterate production
REPL.

## Install

1. In Home Assistant, open **Settings → Apps → App store**.
2. Open **Repositories**, add `https://github.com/iterate/home-assistant`, and
   reload the store.
3. Install **Iterate Home Assistant**.
4. Configure the Iterate project slug and project secret, then start the app.

Full configuration and usage examples are in
[`iterate_home_assistant/DOCS.md`](iterate_home_assistant/DOCS.md).

## Development

```bash
cd iterate_home_assistant
corepack enable
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

The container is published for `aarch64` (including Home Assistant Green) and
`amd64` as `ghcr.io/iterate/home-assistant`.

The app imports the server SDK from `iterate/node`. Until that export is in the
next npm release, `package.json` pins an immutable public SDK preview build from
the Iterate repository.

## License

Apache-2.0.
