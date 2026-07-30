---
state: todo
priority: medium
---

# Build a separate Home Assistant management app

## Outcome

An Iterate agent can administer a Home Assistant installation without giving
the ordinary event/control bridge Supervisor privileges.

## Work

- Publish a separately installable app from this repository.
- Start with `hassio_api: true` and the least-powerful Supervisor role that
  covers backups, app management, logs, updates, configuration validation, and
  restarts.
- Expose typed management operations under a separate ITX path.
- Require confirmation for restore, uninstall, shutdown, reboot, and other
  destructive operations.
- Append an audit record containing actor, reason, request, and resulting state
  for every mutation.
- Treat root HAOS SSH as a separately enabled break-glass mechanism, not a
  normal management API.

## Done when

Users can install the control bridge without management authority, and the
manager can demonstrate a backed-up, validated configuration change with a
complete audit trail.
