# Iterate Home Assistant

A small Home Assistant app that connects one Home Assistant installation to
one [Iterate](https://os.iterate.com) project:

- Home Assistant event-bus events appear in an Iterate stream.
- A typed live capability provides Home Assistant states, services, and
  actions.

The app makes one outbound connection. It needs no public Home Assistant URL,
inbound port, host networking, device mount, or Supervisor administrator
access.

## Requirements

- Home Assistant OS or a Supervised installation with Apps. Home Assistant
  Container and Core installations cannot install Apps.
- An Iterate project and its project API key.
- An `aarch64` or `amd64` Home Assistant host.

## Install

[![Open your Home Assistant instance and add this app repository](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fiterate%2Fhome-assistant)

Alternatively:

1. Open **Settings → Apps → App store** in Home Assistant.
2. Open **Repositories**, add
   `https://github.com/iterate/home-assistant`, and reload the store.
3. Install **Iterate Home Assistant**.
4. In your Iterate project, open **Secrets → project-api-key → Reveal**.
   Configure the app with that value and the project slug from the project's
   URL.
5. Start the app. Its log should report `bridge session ready`.
6. Enable **Start on boot** and **Watchdog** after the first connection works.

Configuration and ITX examples are in the app's Documentation tab and
[`iterate_home_assistant/DOCS.md`](iterate_home_assistant/DOCS.md).

## Security and privacy

This app sends entity states and the events exposed by Home Assistant's
unfiltered event subscription to the configured Iterate project. Project
callers can also invoke Home Assistant actions through the mounted capability.
That may reveal presence and sensor data or operate devices such as lights,
locks, and alarms.

Protect the Iterate project API key like a password and grant project access
accordingly. The Home Assistant Supervisor token remains inside the app and is
never sent to Iterate. The app accepts only an HTTPS Iterate URL.

To report a vulnerability, see [SECURITY.md](SECURITY.md).

## Development

```bash
cd iterate_home_assistant
corepack enable
pnpm install
pnpm typecheck
pnpm build
pnpm format
```

Home Assistant's official builder publishes signed `aarch64` and `amd64`
images as `ghcr.io/iterate/home-assistant`.

The app imports the server SDK from `iterate/node`. Until that export reaches a
normal npm release, the dependency is pinned to an immutable public preview
build. Replacing it is tracked in [`tasks/stable-iterate-sdk.md`](tasks/stable-iterate-sdk.md).

Apache-2.0 licensed.
