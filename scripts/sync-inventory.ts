import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { inventorySchema, type App, type Device } from '../src/server/config.js';

interface EvaluatedConfig {
  nginxEnabled: boolean;
  hosts: Record<
    string,
    {
      root: string | null;
      forceSSL: boolean;
      addSSL: boolean;
      onlySSL: boolean;
      enableACME: boolean;
      locations: Record<string, { proxyPass: string | null }>;
    }
  >;
  units: string[];
}

const repo = resolve(process.argv[2] || '../nix-server');
const expression = `c: {
  nginxEnabled = c.services.nginx.enable;
  hosts = builtins.mapAttrs (name: h: {
    inherit (h) root forceSSL addSSL onlySSL enableACME;
    locations = builtins.mapAttrs (path: l: { inherit (l) proxyPass; }) h.locations;
  }) c.services.nginx.virtualHosts;
  units = builtins.filter (name: c.systemd.services.\${name}.enable) (builtins.attrNames c.systemd.services);
}`;
const fleet = [
  { id: 'hetzner', name: 'Hetzner', subtitle: 'Cloud server · Germany', ssh: 'root@91.99.204.136' },
  {
    id: 'nixpi',
    name: 'nixpi',
    subtitle: 'Raspberry Pi 5 · Home',
    ssh: 'infiniter@nixpi.tail6650cb.ts.net',
  },
  {
    id: 'nixzero',
    name: 'nixzero',
    subtitle: 'Raspberry Pi Zero 2 W · Home',
    ssh: 'infiniter@nixzero.tail6650cb.ts.net',
  },
];
// Runtime mappings verified against container Compose labels and systemd on 2026-10-21.
const mappings: Record<
  string,
  Record<string, [string, string, string, ('docker' | 'systemd')?]>
> = {
  nixpi: {
    status: ['Sentinel', 'sentinel.service', 'Bun / systemd', 'systemd'],
    uptime: ['Fleet status', 'docker-uptime-dashboard.service', 'NixOS container', 'systemd'],
    office: ['Agent Office', 'agent-office.service', 'Node.js / systemd', 'systemd'],
    relay: ['File relay', 'file-relay-relay-1', 'Docker Compose'],
    conversation: ['Conversation', 'conversation-app-1', 'Docker Compose'],
    speech: ['Agentic speech', 'agentic_speech_demo-app-1', 'Docker Compose'],
    bread: ['Bread comparison', 'bread-comparison-app-1', 'Docker Compose'],
    fit: ['Fitness tracker', 'fitness-tracker-frontend', 'Docker Compose'],
    'fit-api': ['Fitness API', 'fitness-tracker', 'Docker Compose'],
    drive: ['Nextcloud', 'phpfpm-nextcloud.service', 'PHP-FPM', 'systemd'],
    'pi-status': ['Pi system metrics', 'grafana.service', 'Grafana', 'systemd'],
    'fitness-ai': ['Fitness AI', 'fitness-ai-convex', 'Convex'],
    'fitness-ai-auth': ['Fitness AI actions', 'fitness-ai-convex', 'Convex'],
    'fitness-ai-dashboard': ['Fitness AI dashboard', 'fitness-ai-dashboard', 'Docker'],
    omw: ['On My Way', 'onmyway-app-1', 'Docker Compose'],
  },
  hetzner: {
    auth: ['Fleet sign-in', 'oauth2-proxy.service', 'OAuth2 Proxy', 'systemd'],
    'edit-shift-distributor': [
      'Shift development',
      'opencode-shift-distributor.service',
      'OpenCode',
      'systemd',
    ],
    'edit-vite-portfolio': [
      'Portfolio development',
      'opencode-vite-portfolio.service',
      'OpenCode',
      'systemd',
    ],
    chat: ['Portfolio chat', 'portfolio-chat', 'Docker Compose'],
    shift: ['Shift distributor', 'shift-distributor', 'Docker Compose'],
    'car-socket': ['Browser car socket', 'browser-car-server-1', 'Docker Compose'],
    uptime: ['Existing uptime route', 'browser-car-server-1', 'Browser car container'],
    version2: ['Addy Art CMS', 'addy-art-payload-app-1', 'Docker Compose'],
    mongo: ['Mongo Express', 'addy-art-payload-mongo-express-1', 'Docker Compose'],
    addyart: ['Addy Art', 'addy-art', 'Docker Compose'],
    'convex-edit': ['Image editor backend', 'ai_image_edit-backend-1', 'Convex'],
    'convex-site-edit': ['Image editor actions', 'ai_image_edit-backend-1', 'Convex'],
    'dashboard-edit': ['Image editor dashboard', 'ai_image_edit-dashboard-1', 'Docker Compose'],
    'db-gol': ['Game of Life backend', 'docker-backend-1', 'Convex'],
    'hetzner-status': ['Sentinel', 'sentinel.service', 'Bun / systemd', 'systemd'],
  },
};
const names: Record<string, string> = {
  photo: 'Photos',
  paste: 'Paste',
  drive: 'Drive',
  netflix: 'Media server',
  fit: 'Fitness tracker',
  'fit-api': 'Fitness API',
  portfolio: 'Portfolio',
  gol: 'Game of Life',
  car: 'Browser car',
  ntfy: 'Notifications',
  edit: 'Image editor',
  n8n: 'n8n',
  share: 'Shared files',
  docsheet: 'Docsheet',
  fish: 'Little Depths',
  recipes: 'Recipes',
  spore: 'Spore',
};
// Manually deployed private containers have no Nix/nginx entry to discover.
// Keep their verified targets here so inventory sync does not drop their monitors.
const privateContainers: Record<string, Array<[string, string, string?, string?]>> = {
  nixpi: [
    [
      'audio-notifications-server-1',
      'Audio notifications',
      'http://127.0.0.1:8787/health',
      'https://nixpi.tail6650cb.ts.net:8444/',
    ],
    ['audio-notifications-kokoro-1', 'Kokoro speech engine'],
    [
      'fitness-ai-experiment',
      'Fitness AI experiment',
      undefined,
      'http://nixpi.tail6650cb.ts.net:43210/',
    ],
  ],
  hetzner: [
    ['addy-art-payload-mongo-1', 'Addy Art MongoDB'],
    ['docker-dashboard-1', 'Game of Life dashboard', 'http://127.0.0.1:6791/'],
  ],
};
const devices: Device[] = [];
for (const host of fleet) {
  console.log(`Evaluating ${host.id}…`);
  const data: EvaluatedConfig = JSON.parse(
    execFileSync(
      'nix',
      [
        'eval',
        '--json',
        '--no-write-lock-file',
        `${repo}#nixosConfigurations.${host.id}.config`,
        '--apply',
        expression,
      ],
      { timeout: 180_000, maxBuffer: 4_000_000, encoding: 'utf8' },
    ),
  );
  const apps: App[] = Object.entries(data.nginxEnabled ? data.hosts : {}).map(([domain, v]) => {
    const key = domain.split('.')[0];
    const mapping = mappings[host.id]?.[key];
    const upstream = v.locations['/']?.proxyPass as string | undefined;
    const external = upstream && !/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(upstream);
    const tls = v.forceSSL || v.addSSL || v.onlySSL || v.enableACME;
    return {
      // Retain the fleet dashboard's original monitor ID across its hostname move.
      id:
        host.id === 'nixpi' && key === 'uptime'
          ? 'nixpi/status.infiniter.tech'
          : host.id === 'nixpi' && key === 'status'
            ? 'nixpi/sentinel'
            : `${host.id}/${domain}`,
      name: mapping?.[0] || names[key] || domain,
      domain,
      url: `${tls ? 'https' : 'http'}://${domain}/`,
      ...(key === 'car-socket' ||
      (key === 'uptime' && host.id === 'hetzner') ||
      (key === 'fit-api' && host.id === 'nixpi')
        ? { healthPath: '/health' }
        : {}),
      ...(key === 'chat' ? { healthPath: '/socket.io/?EIO=4&transport=polling' } : {}),
      ...(key === 'auth' ? { healthPath: '/oauth2/sign_in' } : {}),
      ...(key === 'uptime' && host.id === 'nixpi' ? { healthPath: '/api/health' } : {}),
      ...(mapping?.[1] === 'sentinel.service'
        ? { healthPath: '/healthz', acceptedCodes: [200] }
        : {}),
      ...(key === 'omw' && host.id === 'nixpi'
        ? { healthPath: '/api/health', acceptedCodes: [200] }
        : {}),
      ...(key === 'fitness-ai-auth' ? { healthPath: '/api/auth/ok', acceptedCodes: [200] } : {}),
      ...(key === 'convex-site-edit' ? { healthPath: '/version', acceptedCodes: [200] } : {}),
      kind: external ? 'external' : v.root && !mapping ? 'static' : 'application',
      ...(mapping
        ? { runtime: { type: mapping[3] || 'docker', name: mapping[1], label: mapping[2] } }
        : {}),
      protected: ['mongo', 'pi-status', 'office'].includes(key),
      publicCheck: true,
    };
  });
  for (const [unit, name] of [
    ['sshd', 'SSH'],
    ['tailscaled', 'Tailscale'],
    ['nginx', 'Nginx'],
    ['t3code', 'T3 Code'],
    ['docker', 'Docker'],
    ['postgresql', 'PostgreSQL'],
    ['redis-nextcloud', 'Nextcloud Redis'],
    ['prometheus', 'Prometheus'],
    ['prometheus-node-exporter', 'Prometheus node exporter'],
  ]) {
    if (data.units.includes(unit))
      apps.push({
        id: `${host.id}/service/${unit}`,
        name,
        kind: 'service',
        ...(unit === 't3code' && host.id === 'nixpi'
          ? {
              access: 'tailscale' as const,
              accessUrl: 'https://nixpi.tail6650cb.ts.net:8443/',
              localUrl: 'http://127.0.0.1:3773/',
            }
          : {}),
        runtime: { type: 'systemd', name: `${unit}.service`, label: 'systemd' },
        protected: false,
        publicCheck: false,
      });
  }
  for (const [container, name, localUrl, accessUrl] of privateContainers[host.id] || []) {
    apps.push({
      id: `${host.id}/container/${container}`,
      name,
      kind: 'service',
      access: accessUrl ? 'tailscale' : 'internal',
      ...(accessUrl ? { accessUrl } : {}),
      runtime: { type: 'docker', name: container, label: 'Docker' },
      ...(localUrl ? { localUrl, acceptedCodes: [200] } : {}),
      protected: false,
      publicCheck: false,
    });
  }
  devices.push({ ...host, apps });
}
const revision = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const inventory = inventorySchema.parse({ updatedAt: new Date().toISOString(), revision, devices });
mkdirSync('config', { recursive: true });
writeFileSync(
  'config/fleet.json.tmp',
  await format(JSON.stringify(inventory), {
    ...(await resolveConfig('config/fleet.json')),
    parser: 'json',
  }),
);
renameSync('config/fleet.json.tmp', 'config/fleet.json');
console.log(
  `Saved ${devices.length} devices and ${devices.reduce((n, d) => n + d.apps.length, 0)} monitors.`,
);
