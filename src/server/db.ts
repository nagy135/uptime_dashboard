import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Inventory } from './config.js';
import { POLL_INTERVAL, STALE_AFTER } from './config.js';
import { summarize } from './status.js';
import type { Dashboard, Observation, PublicApp, Status } from '../shared/types.js';

const observations = sqliteTable('observations', {
  id: integer('id').primaryKey(),
  appId: text('app_id').notNull(),
  checkedAt: integer('checked_at').notNull(),
  status: text('status').notNull(),
  evidence: text('evidence', { mode: 'json' }).$type<Observation>().notNull(),
});
export interface DeviceResult {
  deviceId: string;
  checkedAt: number;
  reachable: boolean;
}
export class Store {
  readonly sqlite: Database.Database;
  private orm;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.sqlite = new Database(path);
    this.sqlite.pragma('journal_mode = WAL');
    this.sqlite.pragma('foreign_keys = ON');
    this.sqlite.pragma('busy_timeout = 5000');
    this.orm = drizzle(this.sqlite);
    // Versioned, transactional migration; later schema changes add a new version.
    const version = this.sqlite.pragma('user_version', { simple: true }) as number;
    if (version > 1) throw new Error('Database schema is newer than this application');
    if (version < 1)
      this.sqlite.transaction(() => {
        this.sqlite.exec(`
        CREATE TABLE devices (id TEXT PRIMARY KEY, config TEXT NOT NULL);
        CREATE TABLE apps (id TEXT PRIMARY KEY, device_id TEXT NOT NULL REFERENCES devices(id), config TEXT NOT NULL, first_seen INTEGER NOT NULL, enabled INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE observations (id INTEGER PRIMARY KEY, app_id TEXT NOT NULL REFERENCES apps(id), checked_at INTEGER NOT NULL, status TEXT NOT NULL, evidence TEXT NOT NULL);
        CREATE INDEX observations_app_time ON observations(app_id, checked_at DESC);
        CREATE INDEX observations_time ON observations(checked_at);
        CREATE TABLE device_checks (id INTEGER PRIMARY KEY, device_id TEXT NOT NULL REFERENCES devices(id), checked_at INTEGER NOT NULL, reachable INTEGER NOT NULL);
        CREATE INDEX device_checks_time ON device_checks(device_id, checked_at DESC);
        CREATE TABLE poll_runs (id INTEGER PRIMARY KEY, started_at INTEGER NOT NULL, finished_at INTEGER NOT NULL);
        PRAGMA user_version = 1;
      `);
      })();
  }
  syncInventory(inventory: Inventory, now = Date.now()) {
    this.sqlite.transaction(() => {
      this.sqlite.prepare('UPDATE apps SET enabled = 0').run();
      for (const device of inventory.devices) {
        this.sqlite
          .prepare(
            'INSERT INTO devices VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET config = excluded.config',
          )
          .run(device.id, JSON.stringify(device));
        for (const app of device.apps)
          this.sqlite
            .prepare(
              'INSERT INTO apps VALUES (?, ?, ?, ?, 1) ON CONFLICT(id) DO UPDATE SET config = excluded.config, enabled = 1, device_id = excluded.device_id',
            )
            .run(app.id, device.id, JSON.stringify(app), now);
      }
    })();
  }
  saveCycle(
    startedAt: number,
    results: Observation[],
    devices: DeviceResult[],
    finishedAt = Date.now(),
  ) {
    this.sqlite.transaction(() => {
      for (const result of results)
        this.orm
          .insert(observations)
          .values({
            appId: result.appId,
            checkedAt: result.checkedAt,
            status: result.status,
            evidence: result,
          })
          .run();
      for (const device of devices)
        this.sqlite
          .prepare('INSERT INTO device_checks (device_id, checked_at, reachable) VALUES (?, ?, ?)')
          .run(device.deviceId, device.checkedAt, Number(device.reachable));
      this.sqlite
        .prepare('INSERT INTO poll_runs (started_at, finished_at) VALUES (?, ?)')
        .run(startedAt, finishedAt);
    })();
  }
  prune(now = Date.now()) {
    const cutoff = now - 30 * 86_400_000;
    this.sqlite.transaction(() => {
      for (const table of ['observations', 'device_checks'])
        this.sqlite.prepare(`DELETE FROM ${table} WHERE checked_at < ?`).run(cutoff);
      this.sqlite.prepare('DELETE FROM poll_runs WHERE started_at < ?').run(cutoff);
    })();
  }
  dashboard(inventory: Inventory, nextCheckAt: number | null, now = Date.now()): Dashboard {
    const last = this.sqlite
      .prepare('SELECT started_at FROM poll_runs ORDER BY id DESC LIMIT 1')
      .get() as { started_at: number } | undefined;
    return {
      generatedAt: now,
      lastCheckedAt: last?.started_at ?? null,
      nextCheckAt,
      pollIntervalMs: POLL_INTERVAL,
      staleAfterMs: STALE_AFTER,
      inventoryUpdatedAt: inventory.updatedAt,
      devices: inventory.devices.map((device) => {
        const check = this.sqlite
          .prepare(
            'SELECT checked_at, reachable FROM device_checks WHERE device_id = ? ORDER BY checked_at DESC LIMIT 1',
          )
          .get(device.id) as { checked_at: number; reachable: number } | undefined;
        const seen = this.sqlite
          .prepare(
            'SELECT checked_at FROM device_checks WHERE device_id = ? AND reachable = 1 ORDER BY checked_at DESC LIMIT 1',
          )
          .get(device.id) as { checked_at: number } | undefined;
        const apps: PublicApp[] = device.apps.map((app) => {
          const row = this.sqlite
            .prepare(
              'SELECT evidence FROM observations WHERE app_id = ? ORDER BY checked_at DESC LIMIT 1',
            )
            .get(app.id) as { evidence: string } | undefined;
          const latest: Observation | null = row ? JSON.parse(row.evidence) : null;
          const stale = !latest || now - latest.checkedAt > STALE_AFTER;
          const rows = this.sqlite
            .prepare(
              'SELECT checked_at, status FROM observations WHERE app_id = ? AND checked_at >= ? ORDER BY checked_at',
            )
            .all(app.id, now - 86_400_000) as Array<{ checked_at: number; status: Status }>;
          const known = rows.filter((r) => r.status !== 'unknown');
          const first = this.sqlite
            .prepare('SELECT first_seen FROM apps WHERE id = ?')
            .get(app.id) as { first_seen: number };
          const expected = Math.max(
            1,
            Math.floor((now - Math.max(first.first_seen, now - 86_400_000)) / POLL_INTERVAL) + 1,
          );
          const end = Math.floor(now / POLL_INTERVAL) * POLL_INTERVAL;
          const buckets = new Map(
            rows.map((r) => [Math.floor(r.checked_at / POLL_INTERVAL) * POLL_INTERVAL, r.status]),
          );
          return {
            id: app.id,
            name: app.name,
            kind: app.kind,
            domain: app.domain,
            url: app.url,
            runtimeLabel: app.runtime?.label,
            latest,
            stale,
            status: stale ? 'unknown' : latest!.status,
            history: Array.from({ length: 60 }, (_, i) => {
              const at = end - (59 - i) * POLL_INTERVAL;
              return { at, status: buckets.get(at) || 'unknown' };
            }),
            availability: known.length
              ? Math.round((known.filter((r) => r.status === 'up').length / known.length) * 1000) /
                10
              : null,
            coverage: Math.min(100, Math.round((known.length / expected) * 100)),
          };
        });
        const reachable = check && now - check.checked_at <= STALE_AFTER ? !!check.reachable : null;
        return {
          id: device.id,
          name: device.name,
          subtitle: device.subtitle,
          reachable,
          checkedAt: check?.checked_at ?? null,
          lastSeenAt: seen?.checked_at ?? null,
          status:
            reachable === null
              ? 'unknown'
              : !reachable
                ? 'degraded'
                : summarize(apps.map((a) => a.status)),
          apps,
        };
      }),
    };
  }
  close() {
    this.sqlite.close();
  }
}
