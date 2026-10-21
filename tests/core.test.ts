import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { Store } from '../src/server/db.js';
import { createApp } from '../src/server/app.js';
import {
  Collector,
  fingerprint,
  parseRemote,
  publicProbe,
  remoteScript,
} from '../src/server/collector.js';
import { inventorySchema, type App, type Inventory } from '../src/server/config.js';
import { overall, summarize } from '../src/server/status.js';

const fixture: Inventory = inventorySchema.parse({
  updatedAt: '2026-09-24T00:00:00Z',
  revision: 'test',
  devices: [
    {
      id: 'pi',
      name: 'Pi',
      subtitle: 'Test device',
      ssh: 'private-user@private-host',
      apps: [
        {
          id: 'pi/app',
          name: 'App',
          kind: 'application',
          url: 'https://app.example/',
          runtime: { type: 'docker', name: 'private-container', label: 'Docker' },
        },
      ],
    },
  ],
});
const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((f) => f());
  vi.useRealTimers();
});
function database() {
  const store = new Store(':memory:');
  store.syncInventory(fixture, 1000);
  cleanups.push(() => store.close());
  return store;
}

describe('collection and evidence', () => {
  it('skips disabled targets and keeps them disabled even when a host is unavailable', async () => {
    const inventory = structuredClone(fixture);
    inventory.devices[0].apps.push({
      ...inventory.devices[0].apps[0],
      id: 'pi/retired',
      name: 'Retired app',
      url: 'https://retired.example/',
      disabled: true,
      runtime: { type: 'docker', name: 'retired-container', label: 'Docker' },
    });
    const device = inventory.devices[0];
    expect(remoteScript(device)).not.toContain('retired.example');
    expect(remoteScript(device)).not.toContain('retired-container');
    const results = parseRemote(device, '1\thttp\t500\t0.01\n1\truntime\trunning|healthy\n', 1000);
    expect(results[1]).toEqual({ appId: 'pi/retired', checkedAt: 1000, status: 'disabled' });
    const store = database();
    store.syncInventory(inventory);
    const probe = vi.fn(async (_app: App) => ({ status: 'up' as const, message: 'HTTP 200' }));
    const collector = new Collector(
      inventory,
      store,
      () => {},
      async () => {
        throw new Error('Offline');
      },
      probe,
    );
    await collector.tick();
    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe.mock.calls[0][0].id).toBe('pi/app');
    expect(store.dashboard(inventory, null).devices[0].apps[1]).toMatchObject({
      status: 'disabled',
      stale: false,
      latest: null,
    });
    expect(summarize(['up', 'disabled'])).toBe('up');
    expect(summarize(['disabled'])).toBe('disabled');
    expect(summarize(['down', 'disabled'])).toBe('down');
    expect(summarize(['unknown', 'disabled'])).toBe('unknown');
  });
  it('distinguishes an active process from a failed HTTP route', () => {
    const [result] = parseRemote(
      fixture.devices[0],
      '0\thttp\t502\t0.032\n0\truntime\trunning|healthy\n',
      1000,
    );
    expect(result.status).toBe('down');
    expect(result.runtime?.status).toBe('up');
    expect(result.http?.latencyMs).toBe(32);
  });
  it('keeps failed host collection unknown and detects unhealthy containers', () => {
    expect(parseRemote(fixture.devices[0], '', 1000)[0].status).toBe('unknown');
    expect(
      parseRemote(
        fixture.devices[0],
        '0\thttp\t200\t0.01\n0\truntime\trunning|unhealthy\n',
        1000,
      )[0].status,
    ).toBe('down');
    expect(
      overall({
        http: { status: 'up', message: 'ok' },
        runtime: { status: 'unknown', message: 'missing' },
      }),
    ).toBe('degraded');
  });
  it('checks configured health paths and prevents stale observer mappings', () => {
    const device = structuredClone(fixture.devices[0]);
    const before = fingerprint(device);
    device.apps[0].healthPath = '/health';
    expect(fingerprint(device)).not.toBe(before);
    expect(remoteScript(device)).toContain("'https://app.example/health'");
    expect(remoteScript(device)).toContain('app.example:443:127.0.0.1');
  });
  it('checks private HTTP health locally without probing its Tailscale access link', async () => {
    const inventory = structuredClone(fixture);
    inventory.devices[0].apps = [
      {
        id: 'pi/audio',
        name: 'Audio notifications',
        kind: 'service',
        access: 'tailscale',
        accessUrl: 'https://private.example:8444/',
        localUrl: 'http://127.0.0.1:8787/health',
        acceptedCodes: [200],
        protected: false,
        publicCheck: false,
      },
    ];
    const device = inventory.devices[0];
    expect(remoteScript(device)).toContain("'http://127.0.0.1:8787/health'");
    expect(remoteScript(device)).not.toContain('private.example');
    expect(parseRemote(device, '', 1000)[0].http?.status).toBe('unknown');
    expect(parseRemote(device, '0\thttp\t503\t0.01\n', 1000)[0].status).toBe('down');
    const store = database();
    store.syncInventory(inventory, 1000);
    const probe = vi.fn();
    const collector = new Collector(
      inventory,
      store,
      () => {},
      async () => '0\thttp\t200\t0.01\n',
      probe,
    );
    await collector.tick();
    expect(probe).not.toHaveBeenCalled();
    const dashboard = store.dashboard(inventory, null);
    expect(dashboard.devices[0].apps[0]).toMatchObject({
      access: 'tailscale',
      url: 'https://private.example:8444/',
      status: 'up',
    });
    expect(JSON.stringify(dashboard)).not.toContain('127.0.0.1');
    expect(JSON.stringify(dashboard)).not.toContain('localUrl');
  });
  it('probes HTTP without following authentication redirects or downloading bodies', async () => {
    const server = createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(204);
        res.end();
      } else {
        res.writeHead(302, { location: 'http://unwanted.invalid/' });
        res.end();
      }
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    cleanups.push(() => server.close());
    const port = (server.address() as { port: number }).port;
    const app = {
      ...fixture.devices[0].apps[0],
      url: `http://127.0.0.1:${port}/`,
      healthPath: '/health',
    };
    expect((await publicProbe(app)).code).toBe(204);
    expect((await publicProbe({ ...app, healthPath: undefined })).code).toBe(302);
  });
  it('polls independently every 30 seconds and does not overlap cycles', async () => {
    vi.useFakeTimers();
    const store = database();
    let release!: (s: string) => void;
    const remote = vi.fn(
      () =>
        new Promise<string>((r) => {
          release = r;
        }),
    );
    const probe = vi.fn(async () => ({ status: 'up' as const, message: 'HTTP 200' }));
    const collector = new Collector(fixture, store, () => {}, remote, probe);
    collector.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(remote).toHaveBeenCalledTimes(1);
    release('0\thttp\t200\t0.01\n0\truntime\trunning|healthy\n');
    await collector.tick();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(remote).toHaveBeenCalledTimes(2);
    release('');
    await collector.tick();
    await collector.stop();
    expect(store.sqlite.prepare('SELECT COUNT(*) AS n FROM poll_runs').get()).toEqual({ n: 2 });
  });
});

describe('storage and public API', () => {
  it('retains disabled monitors and their observations without treating pauses as failed checks', () => {
    const store = database();
    store.saveCycle(1000, [{ appId: 'pi/app', checkedAt: 1000, status: 'down' }], [], 1000);
    const disabled = structuredClone(fixture);
    disabled.devices[0].apps[0].disabled = true;
    store.syncInventory(disabled, 31_000);
    const app = store.dashboard(disabled, null, 200_000).devices[0].apps[0];
    expect(app).toMatchObject({
      id: 'pi/app',
      status: 'disabled',
      stale: false,
      latest: null,
      availability: null,
      coverage: 0,
    });
    expect(store.sqlite.prepare('SELECT enabled FROM apps').get()).toEqual({ enabled: 1 });
    expect(store.sqlite.prepare('SELECT COUNT(*) AS n FROM observations').get()).toEqual({ n: 1 });
    // A later re-enable resumes normal monitoring; paused samples do not reduce success or coverage.
    store.saveCycle(
      31_000,
      [{ appId: 'pi/app', checkedAt: 31_000, status: 'disabled' }],
      [],
      31_000,
    );
    store.syncInventory(fixture, 61_000);
    store.saveCycle(
      61_000,
      [{ appId: 'pi/app', checkedAt: 61_000, status: 'up' }],
      [{ deviceId: 'pi', checkedAt: 61_000, reachable: true }],
      61_000,
    );
    const enabled = store.dashboard(fixture, null, 61_000).devices[0].apps[0];
    expect(enabled.status).toBe('up');
    expect(enabled.availability).toBe(50);
    expect(enabled.coverage).toBe(100);
    expect(enabled.history.some((point) => point.status === 'disabled')).toBe(true);
  });
  it('persists observations after reopening SQLite and marks old data stale', () => {
    const directory = mkdtempSync(join(tmpdir(), 'fleet-test-'));
    cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
    const path = join(directory, 'fleet.sqlite');
    const first = new Store(path);
    first.syncInventory(fixture, 1000);
    first.saveCycle(
      1000,
      [{ appId: 'pi/app', checkedAt: 1000, status: 'up' }],
      [{ deviceId: 'pi', checkedAt: 1000, reachable: true }],
      1200,
    );
    first.close();
    const second = new Store(path);
    cleanups.push(() => second.close());
    const fresh = second.dashboard(fixture, null, 2000).devices[0];
    expect(fresh.apps[0].status).toBe('up');
    expect(fresh.apps[0].availability).toBe(100);
    const stale = second.dashboard(fixture, null, 100_000).devices[0];
    expect(stale.apps[0].status).toBe('unknown');
    expect(stale.reachable).toBeNull();
    expect(stale.apps[0].coverage).toBeLessThan(100);
    expect(stale.apps[0].history.filter((p) => p.status === 'unknown').length).toBeGreaterThan(50);
  });
  it('serves unauthenticated read access without SSH targets or mutation endpoints', async () => {
    const store = database();
    const app = await createApp(fixture, store, () => null);
    cleanups.push(() => {
      void app.close();
    });
    const response = await app.inject('/api/status');
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).not.toContain('private-user');
    expect(response.body).not.toContain('private-host');
    expect(response.body).not.toContain('private-container');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/status',
          payload: { url: 'http://internal' },
        })
      ).statusCode,
    ).toBe(404);
    expect((await app.inject('/api/status/../../config/fleet.json')).statusCode).toBe(404);
  });
  it('archives removed monitors and prunes old observations', () => {
    const store = database();
    store.saveCycle(1000, [{ appId: 'pi/app', checkedAt: 1000, status: 'down' }], [], 1000);
    const updated = structuredClone(fixture);
    updated.devices[0].apps = [];
    store.syncInventory(updated, 2000);
    expect(store.sqlite.prepare('SELECT enabled FROM apps').get()).toEqual({ enabled: 0 });
    expect(store.sqlite.prepare('SELECT COUNT(*) AS n FROM observations').get()).toEqual({ n: 1 });
    store.prune(31 * 86_400_000);
    expect(store.sqlite.prepare('SELECT COUNT(*) AS n FROM observations').get()).toEqual({ n: 0 });
  });
});
