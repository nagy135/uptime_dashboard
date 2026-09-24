# Fleet uptime dashboard — first draft

Historical first draft; see README.md for the implemented public deployment.

Status: proposal, based on source inspection of `../nix-server` on 2026-09-24.
No live availability checks or deployments have been performed.

## Proposed stack

| Layer | Choice | Purpose |
| --- | --- | --- |
| Language | TypeScript | Shared inventory, check-result, and API types |
| UI | React + Vite | A dashboard with one section per fleet device |
| Styling | Tailwind CSS | Responsive device sections, status badges, history bars |
| Browser data | TanStack Query | Fetch stored status every 30 seconds; refresh on focus |
| Server | Node.js LTS + Fastify | JSON API, compiled frontend assets, background polling |
| Storage | SQLite + better-sqlite3 + Drizzle | Local database, typed queries, versioned migrations |
| Inventory | Nix evaluation → filtered JSON | Read the effective host configuration, including imported modules |
| Runtime inspection | OpenSSH over Tailscale | Batch read-only systemd and local HTTP checks per device |
| Deployment | NixOS systemd service behind nginx | One central process and persistent SQLite storage |
| Verification | Vitest + Playwright | Check classification, database persistence, dashboard behavior |

Use stable dependency releases pinned in a lockfile when implementation begins.
Proposed central host: Hetzner. Keep dashboard access private through Tailscale
initially. Store the database under `/var/lib/uptime-dashboard/` with WAL mode,
foreign keys, migrations, and scheduled SQLite-consistent backups.

## What the existing configuration tells us

- Fleet sections: `hetzner`, `nixpi`, and `nixzero`. The Mac is outside this
  repository's inventory and can be added later from `nix-darwin`.
- Hetzner has reverse-proxied applications and static sites. Its
  `uptime.infiniter.tech` and `car-socket.infiniter.tech` routes both target port
  13331. Verify the existing listener before choosing this dashboard's port.
- nixpi has web routes in its host file and imported modules, including
  Nextcloud, Fitness AI, and an existing Grafana system-metrics dashboard.
- nixzero currently defines infrastructure services but no nginx apps. Show its
  reachability and selected services with an explicit empty web-app section.
- `fit.infiniter.tech`, `fit-api.infiniter.tech`, and `drive.infiniter.tech`
  occur on both larger hosts. Public DNS alone cannot identify host health.
- File relay is explicitly run by manual Docker Compose, without a Nix-managed
  application systemd unit. Other routes also lack a declared app-unit mapping.
- Hermes is currently disabled; retained source definitions should not become
  active monitors.

## Inventory and collection

1. Export a small allowlisted JSON inventory from evaluated
   `nixosConfigurations.<host>.config`: nginx virtual hosts, aliases, locations,
   upstreams, static roots, enabled service metadata, and OCI container metadata.
   Do not export service environments, credentials, or entire configurations.
   Refresh on configuration sync, not every poll; retain the last valid inventory
   if evaluation fails. Record its source revision and sync time.
2. Key applications by device plus virtual host, and checks by application plus
   location/target. Group aliases and multiple routes under the same app where
   appropriate. Provide explicit overrides for display names, health paths,
   accepted responses, unit/container mappings, and excluded services.
3. Start a server-side collection cycle every **30 seconds**, even when nobody
   has the dashboard open. Batch remote work into one SSH session per host with
   bounded concurrency, per-check timeouts, and a cycle deadline below 30 seconds.
   Never overlap cycles. A failed device must not block checks for other devices.
4. Check each device's nginx locally through SSH while preserving hostname and
   TLS SNI, for example with curl's resolve support. Run separate public URL
   checks to distinguish local app availability from DNS/public ingress failures.
5. Inspect mapped systemd units with read-only structured properties. OCI units
   provide a mapping for Nix-managed containers. Manual Compose apps need an
   explicit mapping and restricted inspection helper if container state is wanted;
   otherwise show HTTP health and “service state unavailable.” Do not infer unit
   ownership merely from port numbers or grant broad Docker socket access.
6. Keep standalone long-running services in a device's service list. Do not
   classify idle timers or completed oneshot services as failed applications.

## Status and display

Each device section shows reachability, last successful collection, app counts,
and its applications/services. Each app shows its URL, HTTP status, latency,
service state when known, last checked time, and recent availability history.

Use **up**, **down**, **degraded**, and **unknown/stale**. A successful HTTP
response does not prove a process is healthy; an active process does not prove
the app works. Show both signals. Treat expected authentication responses as
reachable/protected, not proof of application health; configure health endpoints
and accepted status codes per app. Validate certificates and bound redirects.

Missed collection or SSH failure makes unavailable service evidence unknown,
not automatically “app down.” Keep independent HTTP evidence visible. Mark
observations stale after 90 seconds and show the age of the last measurement.
The browser reads saved results every 30 seconds without initiating fleet checks.

## SQLite model

- `devices`: stable key, display name, connection target, inventory revision.
- `apps`: device, virtual host/service identity, kind, display name, enabled state.
- `check_targets`: app, check kind, URL/unit/container, expected result policy.
- `poll_runs`: cycle start/end, collector failures and completion state.
- `observations`: target, timestamp, status, latency, response/unit state, error.
- `incidents`: target, opened/closed timestamps, failure reason.

Index observations by target and timestamp. Store timestamps in UTC. Keep raw
observations for 30 days initially; archive removed targets so history survives.
Calculate uptime from observed intervals and disclose missing coverage rather
than treating missed polls as successes. Retention and longer-term rollups can
be adjusted after measuring actual database growth.

## Implementation order

1. Inventory exporter and reviewed host/app mappings.
2. Collector, SQLite migrations, read API, and check-policy tests.
3. Device dashboard, status history, filters, and automatic refresh.
4. NixOS packaging, restricted monitoring access, and deployment verification.

## Reference documentation

- [Fastify TypeScript](https://fastify.dev/docs/latest/Reference/TypeScript/)
- [Drizzle SQLite drivers](https://orm.drizzle.team/docs/sqlite/get-started-sqlite)
- [TanStack Query polling](https://tanstack.com/query/latest/docs/framework/react/guides/polling)
