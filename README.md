# Infiniter fleet status

A public React dashboard for Hetzner, nixpi, and nixzero. A server-side collector
checks the configured apps and services every **30 seconds**, persists results
in SQLite, and exposes a read-only status API. Browser refreshes never trigger
fleet commands. Production URL: **https://status.infiniter.tech** on nixpi.

## Run locally

Requires Node.js 24, npm, OpenSSH, and existing SSH access to the fleet.

```sh
npm ci
npm run build
npm start
```

Open http://localhost:13332. For frontend development, use `npm run dev` and open
http://localhost:5173. The API remains on port 13332. There is no login.

```sh
npm run format            # format supported project files with Prettier
npm run format:check      # check formatting without changes
npm run lint              # ESLint: TypeScript and React Hooks
npm run lint:fix          # apply automatic lint fixes
npm test                  # collector, HTTP, SQLite, and public API integration tests
npm run test:e2e           # desktop and mobile in installed Google Chrome
npm run inventory:sync    # evaluate ../nix-server; requires Nix
npm run check:once        # one collection; stop the regular collector first
```

## How checks work

- Inventory comes from evaluated Nix configuration, including generated nginx
  routes. Disabled nginx configurations are excluded. Runtime mappings were
  verified using Docker Compose labels and systemd on the actual devices.
- One SSH connection per device runs parallel local nginx requests with the
  correct hostname and TLS SNI, plus mapped container/systemd checks.
- Dedicated paths check Fitness API and browser-car health, the chat Socket.IO
  endpoint, Fitness AI auth at `/api/auth/ok`, and the dashboard health API. HTTP redirects indicate a responding
  route, not a successful authenticated login. Convex action roots returning 404
  show **degraded / health unverified**, with the container state alongside.
- Public URL checks are stored separately. Duplicate domains on different hosts
  are intentionally distinct monitors: public DNS can point to only one of them.
- Failed HTTP checks or stopped/unhealthy runtimes are **down**. Missing evidence
  is **unknown**. Conflicting/incomplete evidence is **degraded**. Records older
  than 90 seconds become stale, including when the API cannot refresh.
- The UI shows 30 minutes of history and a 24-hour successful-check percentage.
  Unknown/missing observations are excluded from that percentage; coverage is
  disclosed in row details. This is sampled availability, not a guarantee of
  continuous uptime between checks.
- Data is retained for 30 days. Removed inventory entries are archived in SQLite.
  Nix inventory updates are explicit; run sync and redeploy after changing routes.

## Stack and layout

React / Vite / Tailwind / TanStack Query; Node.js / Fastify / TypeScript;
better-sqlite3 / Drizzle. One application instance owns the collector and database.

- `src/client/`: responsive dashboard.
- `src/server/`: API, collector, status rules, versioned SQLite migrations.
- `config/fleet.json`: local inventory (not served publicly).
- `scripts/sync-inventory.ts`: Nix discovery and verified service/health mappings.
- `deploy/fleet.json`: inventory using restricted production observer access.
- `deploy/observers/`: generated fixed scripts, one per device.
- `deploy/uptime-dashboard.nix`: container, HTTPS route, DDNS record, daily backups.

The API exposes names, domains, status evidence, and history. It excludes SSH
addresses, usernames, container identifiers, credentials, and raw command errors.
There are no write APIs, arbitrary probe URLs, or remote-command endpoints.

## Configuration

| Environment variable   | Default                                             |
| ---------------------- | --------------------------------------------------- |
| `PORT`                 | `13332`                                             |
| `HOST`                 | `0.0.0.0`                                           |
| `DATABASE_PATH`        | `data/fleet.sqlite`                                 |
| `INVENTORY_PATH`       | `config/fleet.json`                                 |
| `SSH_IDENTITY_FILE`    | OpenSSH defaults; production `/app/ssh/id_ed25519`  |
| `SSH_KNOWN_HOSTS_FILE` | OpenSSH defaults; production `/app/ssh/known_hosts` |

The interval is fixed at 30 seconds. Network checks have 7-second deadlines;
SSH collection has a 15-second deadline. Scheduled cycles never overlap.

## Production on nixpi

The source checkout is `/home/infiniter/services/uptime_dashboard`. Docker builds
an ARM64 image locally; the NixOS OCI service `docker-uptime-dashboard.service`
runs it behind nginx on `127.0.0.1:13332`. The container runs as uid 1000 with a
read-only filesystem, dropped capabilities, and no host Docker socket.

Persistent state lives in `/var/lib/uptime-dashboard/`:

- `data/fleet.sqlite` (plus SQLite WAL files), owned by uid/gid 1000.
- `ssh/id_ed25519` and `ssh/known_hosts`, mounted read-only into the container.
- `fleet.json`, production inventory mounted read-only.
- `backups/`, daily SQLite-consistent snapshots retained for seven days.

The dedicated SSH key is authorized on each host only with `restrict` and a
forced command executing `/var/lib/fleet-observer/check.sh`. That root-owned
script runs fixed read-only checks and ignores the requested command and stdin.
It cannot be used for a shell, file transfer, or port forwarding. Observer output
includes an inventory fingerprint; mismatched deployments fail closed as unknown.

To update, transfer committed source with Git, build the new image on nixpi,
and copy `deploy/fleet.json` into the state directory. If inventory changed,
regenerate and deploy observers first:

```sh
npm run inventory:sync
npx tsx scripts/export-observers.ts
# Deploy the generated scripts, root-owned mode 0755, on their matching hosts.
# Build on nixpi, from its checkout:
docker build -t uptime-dashboard:local .
# As root on nixpi:
install -m 0644 deploy/fleet.json /var/lib/uptime-dashboard/fleet.json
systemctl restart docker-uptime-dashboard
```

The Nix module is imported by `nix-server/hosts/nixpi/default.nix`. Apply Nix
changes using the usual `nixos-rebuild switch --flake .#nixpi` workflow. The DDNS
updater provisions `status.infiniter.tech`; nginx obtains its ACME certificate.

Verify `/api/health`, `/api/status`, and fresh `poll_runs` records at least 30
seconds apart. For backups, use SQLite's `.backup` or the built-in backup timer;
do not copy only the main database while WAL writes are active. To roll back an
application release, restore the prior Docker image tag and restart its service.
