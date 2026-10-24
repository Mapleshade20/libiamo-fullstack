---
title: Bounded access logs, operational checks and local backups
related-design: docs/design/2026-10-24-deployment-operations.md
---

# What changed

`deploy/podman/ops/` now travels with the existing deployment. The parent
installer provisions user timers and a separately privileged Caddy integration;
reinstallation preserves private configuration. Paths derive from home/UID,
SMTP comes from existing application configuration, and the PostgreSQL image and
database identity come from the running container. Operator addresses are not
checked in.

- Private JSON access logs: 20 MiB files, ten compressed archives, fourteen-day
  maximum archive age. Remove original headers/URI/TLS details; log bounded path,
  User-Agent and Ray ID, with no query and no password-reset path token.
  The default runtime encoder also removes raw request metadata, so upstream
  errors cannot bypass access-log redaction by writing it to the journal.
- One-minute checks: local/database readiness, public readiness from the host,
  log freshness, disk/inodes, available memory, container health/OOM and observed
  restarts, recent sampled 5xx, LLM volume, backups and scheduled-job failures.
  Three-sample failure/recovery debounce, six-hour unchanged reminders and
  fifteen-minute failed-email backoff. State distinguishes SMTP acceptance from
  inbox delivery.
- Daily PostgreSQL custom-format backups: atomic publication, checksum, TOC
  validation, lock/timeout/size/free-space safeguards, fourteen-archive/two-GiB
  retention. Weekly disposable, resource-limited, network-isolated transactional
  restore with no production mounts or application workers.

Operational commands, configuration, migration and limitations are documented in
`deploy/podman/ops/README.md` and linked from deployment instructions.

# Verification on the existing host

- Real isolated Caddy probes exercised decoded/long/newline-containing sensitive
  paths, query/header redaction, untrusted client-IP rejection, field bounds and
  compressed rotation. Production log redaction/IP handling was also checked.
- The host had an old Caddy in PATH, different from the running service. The
  provisioner now validates with the running executable, forwards only explicitly
  referenced environment variables (never systemd notification variables), and
  pre-creates log files with service-writable ownership before validation.
- Generated real backups and restored one into a disposable PostgreSQL container:
  32 public tables, 31 migration rows and 9 user rows were readable. Test
  containers/volumes were removed. These counts are observations, not test fixtures.
- SMTP accepted the requested notification test and operational alert/recovery
  messages. The public probe now identifies itself rather than using Python's
  generic User-Agent. Final monitor state had no current or delivered issues.
- Caddy, both production containers, database-backed `/health`, browser-origin
  health fetch and Cloudflare Tunnel remained healthy. No app/DB restart.
- Seven Python tests cover retention bounds, preserving old backups on failure,
  partial cleanup, alert/retry/recovery semantics, bounded log scanning, checksum
  failure, and isolated-container cleanup on restore failure. Repository checks
  passed; Vitest passed 179 files / 1,441 tests.

# Remaining boundaries

The backups are same-host, permission-restricted and not independently encrypted;
they do not survive disk loss/host compromise. External uptime/dead-man checks
still need a separate machine/service; on-host checks cannot report total host
failure. LLM trace counters are activity signals, not complete billing records.
Host rsyslog policy, application resource limits and business concurrency limits
were not changed. Existing unrelated working-tree edits were left untouched.

# Review hardening

First installs now stage operations without activating timers or requiring an
already-configured Caddy site. Subsequent integration failures still exit nonzero
after printing the report. Units use the validated Python interpreter and allow
45 minutes including bounded lock waits. Compressed logs retain their tail and
are skipped when the active file covers the window. Caddy edits distinguish
global options from other sites and support explicit HTTPS/multiple addresses.
Partial recovery messages identify recovered checks; HTTP origins no longer
assume public-probe traffic. Thirteen Python regressions cover these boundaries.
