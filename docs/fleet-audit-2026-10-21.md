# Fleet audit — 21 October 2026

Compared the evaluated `nix-server` configuration at `09719df` with running
systemd units, Docker containers, published ports, nginx routes, and Tailscale
Serve on nixpi and Hetzner. Inventory increased from 48 to 66 monitors. All 18
added monitors passed their on-device checks during this audit.

## Previously missing monitors

On nixpi:

- Docsheet, Little Depths, On My Way, Recipes, and Spore.
- Sentinel at `status.infiniter.tech` (separate from this uptime dashboard).
- Audio notifications, its Kokoro speech engine, and the Fitness AI experiment.
- Docker, PostgreSQL, Nextcloud Redis, Prometheus, and its node exporter.

On Hetzner:

- Sentinel at `hetzner-status.infiniter.tech`.
- Addy Art MongoDB and the Game of Life Convex dashboard.
- Docker.

Every running Docker container on both hosts is now represented, either directly
or by its NixOS container service. Private containers without nginx routes are
listed explicitly in `scripts/sync-inventory.ts`; they need a runtime audit when
new services are deployed.

## Private access

Private services have their own group on each host. Tailscale links are provided
for audio notifications (HTTPS port 8444), T3 Code (HTTPS port 8443), and the
Fitness AI experiment (HTTP port 43210). These links require the tailnet.
Other internal services are labeled **On host** and have no web link.

Health probes run on the owning host. Local health URLs are excluded from the
public API, and private services do not get a public probe. These checks verify
the service itself, not the full client-to-Tailscale network path. Kokoro uses its
container health check; the Fitness AI experiment has only a runtime check.

Sentinel now uses its unauthenticated `/healthz` endpoint rather than the
protected metrics API. On My Way uses `/api/health`, and audio notifications
uses its localhost `/health` endpoint plus Docker health.

## Outstanding findings

- Hetzner's Drive, Fitness API, Fitness tracker, n8n, Media server, Notifications,
  Paste, and Photos routes return **502**. Their configured upstream ports have
  no listening service. Fitness is running on nixpi; the old Hetzner routes remain
  configured and are kept visible as failures.
- Both Hetzner OpenCode services repeatedly crash with **SIGSEGV**, including
  while nginx redirects unauthenticated requests to sign-in.
- Hetzner Mongo Express's container is running, but its HTTPS route fails TLS
  verification. Certificate renewal fails for the unrelated `www.mongo.eu`
  alias because its ACME challenge resolves elsewhere. The Fitness hostname's
  renewal unit is also failed and needs investigation.
- nixzero's Tailscale SSH connection times out. Its existing SSH/Tailscale
  monitors and observer fingerprint are unchanged; live coverage is unverified.
- A legacy `hermes-agent` container on Hetzner has been stopped for four months.
  No active Hermes systemd units exist on either inspected host. It was not added
  as a newly deployed service.

No application failures or NixOS configurations were changed during this audit.
Existing unrelated edits to Hetzner's private files and nixpi's backup files were
preserved.
