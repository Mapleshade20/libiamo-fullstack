---
title: Portable access logging, monitoring and local database backups
type: [security, feature]
status: done
---

# Scope

Extend the rootless Podman deployment, not the application image. Copying
`deploy/podman/` and running its installer must also install the operational
scripts and user timers. Preserve existing configuration on repeated installs.
Do not change application resources, business limits or Cloudflare rules here.

## Boundaries

- Caddy access logs are JSON, bounded by size/count/age. Remove request/response
  headers and original URI; add only a bounded decoded path, User-Agent and Ray
  ID. Remove queries and redact password-reset path tokens. File permissions
  grant only Caddy and the deployment user access. A root provisioning step
  validates configuration before reload and rolls back on failure.
- User timers monitor readiness (already includes a database round-trip), disk,
  inodes, memory pressure, container health/OOM, restarts, recent 5xx, LLM volume,
  backup freshness and restore-drill freshness. Persist bounded state atomically;
  debounce failures, batch email, retry failed delivery with backoff, and report
  recovery. Read SMTP configuration locally; never print credentials or include
  request details in alerts.
- A host cannot reliably report its own total outage. External `/health` checks
  and dead-man monitoring remain a separate, explicitly unprovisioned dependency.
- Daily custom-format PostgreSQL dumps use the running database image/tools,
  a lock, timeout, temporary file and atomic publication. Bound local retention
  by count and bytes; prune only after a new archive passes structural checks.
  Local copies are private but are neither off-site nor independently encrypted.
- Weekly restore drills run in a disposable container with no network, ports or
  production mounts. Restore with error/transaction guards; validate restored
  tables and migration/data counts. Always remove the test container and volumes.
  Never restore into the production database or start application workers.

## Portability

Derive paths from the deployment user's home/UID. Container names and local
health URL are configurable. Derive PostgreSQL user/database/image from container
metadata, not checked-in credentials. Recipient addresses belong only in the
server's private `ops.json`. Caddy is host infrastructure: an installer must
explicitly provision its logging integration with sudo or report it as missing;
it must not claim that installing user timers alone completes host logging.

## Verification

Use Python unit tests for retention, state transitions, bounded log reading and
backup failure cleanup. Exercise real Caddy redaction and rotation on an isolated
loopback listener, a real dump and disposable restore, email delivery, and the
public site. Run the repository check/test commands without changing unrelated
work. No production load test or simulated production outage is required.
