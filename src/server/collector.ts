import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import type { App, Device, Inventory } from './config.js';
import { POLL_INTERVAL } from './config.js';
import type { Evidence, Observation } from '../shared/types.js';
import { httpEvidence, overall } from './status.js';
import type { Store, DeviceResult } from './db.js';

export const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
export const fingerprint = (device: Device) => createHash('sha256').update(JSON.stringify(device.apps)).digest('hex').slice(0, 16);
export const probeUrl = (app: App) => app.healthPath ? new URL(app.healthPath, app.url).href : app.url!;
const unknown = (message = 'Device collection unavailable'): Evidence => ({ status: 'unknown', message });

// One SSH connection per device. Each small job prints a single complete TSV line.
// All arguments originate from the local, validated inventory; no API accepts targets.
export function remoteScript(device: Device): string {
  const jobs: string[] = [];
  for (const [index, app] of device.apps.entries()) {
    if (app.url) {
      const url = new URL(probeUrl(app));
      jobs.push(`( result=$(curl --silent --output /dev/null --connect-timeout 3 --max-time 7 --noproxy '*' --resolve ${quote(`${url.hostname}:${url.port || (url.protocol === 'https:' ? '443' : '80')}:127.0.0.1`)} --write-out '%{http_code}\\t%{time_total}' ${quote(url.href)} 2>/dev/null); printf '${index}\\thttp\\t%s\\n' "$result" ) &`);
    }
    if (app.runtime?.type === 'systemd') jobs.push(`( result=$(systemctl show --property=ActiveState --value -- ${quote(app.runtime.name)} 2>/dev/null) || result=unknown; printf '${index}\\truntime\\t%s\\n' "$result" ) &`);
    if (app.runtime?.type === 'docker') jobs.push(`( result=$(docker inspect --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' -- ${quote(app.runtime.name)} 2>/dev/null) || result=unknown; printf '${index}\\truntime\\t%s\\n' "$result" ) &`);
  }
  return `set -u\nprintf 'ready ${fingerprint(device)}\\n'\n${jobs.join('\n')}\nwait\n`;
}
export function runRemote(device: Device, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ['-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', '-o', 'ServerAliveInterval=5', '-o', 'ServerAliveCountMax=1', '-o', 'StrictHostKeyChecking=yes'];
    if (process.env.SSH_IDENTITY_FILE) args.push('-i', process.env.SSH_IDENTITY_FILE, '-o', 'IdentitiesOnly=yes');
    if (process.env.SSH_KNOWN_HOSTS_FILE) args.push('-o', `UserKnownHostsFile=${process.env.SSH_KNOWN_HOSTS_FILE}`);
    args.push(device.ssh, 'bash', '-s');
    const child = spawn('ssh', args, { stdio: ['pipe', 'pipe', 'pipe'], signal });
    let output = '';
    const timeout = setTimeout(() => child.kill('SIGKILL'), 15_000);
    child.stdout.on('data', chunk => { output += chunk; if (output.length > 1_000_000) child.kill('SIGKILL'); });
    child.stderr.resume(); // Never expose remote command output or connection details publicly.
    child.stdin.on('error', () => {});
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('close', code => { clearTimeout(timeout); code === 0 && output.startsWith(`ready ${fingerprint(device)}\n`) ? resolve(output) : reject(new Error('Device collection unavailable')); });
    child.stdin.end(remoteScript(device));
  });
}
export function parseRemote(device: Device, output: string, checkedAt: number): Observation[] {
  const results = device.apps.map(app => ({
    appId: app.id, checkedAt, status: 'unknown',
    ...(app.url ? { http: unknown('HTTP check unavailable') } : {}),
    ...(app.runtime ? { runtime: unknown('Runtime check unavailable') } : {}),
  }) as Observation);
  for (const line of output.split('\n')) {
    const [index, kind, value, seconds] = line.split('\t');
    if (!/^\d+$/.test(index)) continue;
    const app = device.apps[Number(index)], result = results[Number(index)];
    if (!app || !result) continue;
    if (kind === 'http' && app.url) result.http = httpEvidence(Number(value) || 0, Math.round((Number(seconds) || 0) * 1000), app);
    if (kind === 'runtime' && app.runtime) {
      const [state, health] = value.split('|');
      const status = ['active', 'running'].includes(state) ? (health === 'unhealthy' ? 'down' : health === 'starting' ? 'degraded' : 'up') : ['inactive', 'failed', 'exited', 'dead', 'restarting', 'paused', 'activating', 'deactivating'].includes(state) ? 'down' : 'unknown';
      // Fixed messages avoid reflecting remote errors or private data into the public API.
      result.runtime = { status, message: status === 'unknown' ? 'Runtime check unavailable' : health === 'unhealthy' ? 'Container health check failed' : health === 'starting' ? 'Container health check starting' : status === 'up' ? 'Running' : 'Stopped or restarting' };
    }
  }
  return results.map(result => ({ ...result, status: overall(result) }));
}
export async function publicProbe(app: App, signal?: AbortSignal): Promise<Evidence> {
  const started = performance.now();
  try {
    // A bounded GET tests APIs that do not implement HEAD. Do not download bodies.
    const response = await fetch(probeUrl(app), { redirect: 'manual', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(7000)]) : AbortSignal.timeout(7000), headers: { 'user-agent': 'Infiniter-Fleet/1.0' } });
    await response.body?.cancel();
    return httpEvidence(response.status, Math.round(performance.now() - started), app);
  } catch {
    return { status: 'down', message: 'Public endpoint unavailable', latencyMs: Math.round(performance.now() - started) };
  }
}
export class Collector {
  nextCheckAt: number | null = null;
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private controller = new AbortController();
  private cycles = 0;
  constructor(private inventory: Inventory, private store: Store, private log: (error: unknown) => void = console.error,
    private remote = runRemote, private probe = publicProbe) {}
  start() {
    this.nextCheckAt = Date.now() + POLL_INTERVAL;
    void this.tick();
    this.timer = setInterval(() => {
      this.nextCheckAt = Date.now() + POLL_INTERVAL;
      void this.tick();
    }, POLL_INTERVAL);
  }
  tick(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.collect().catch(this.log).finally(() => { this.running = undefined; });
    return this.running;
  }
  private async collect() {
    const startedAt = Date.now();
    const signal = this.controller.signal;
    const observations: Observation[] = [];
    const devices: DeviceResult[] = [];
    await Promise.all(this.inventory.devices.map(async device => {
      const remote = this.remote(device, signal).then(output => ({ output, reachable: true }), () => ({ output: '', reachable: false }));
      const publicResults = new Map<string, Evidence>();
      // At most 100 trusted inventory targets per device. Independent 7 s deadlines.
      await Promise.all(device.apps.filter(a => a.url && a.publicCheck).map(async app => {
        publicResults.set(app.id, await this.probe(app, signal).catch(() => unknown('Public check unavailable')));
      }));
      const { output, reachable } = await remote;
      devices.push({ deviceId: device.id, checkedAt: startedAt, reachable });
      for (const result of parseRemote(device, output, startedAt)) {
        result.public = publicResults.get(result.appId);
        observations.push(result);
      }
    }));
    if (signal.aborted) return;
    this.store.saveCycle(startedAt, observations, devices);
    if (this.cycles++ % 120 === 0) this.store.prune();
  }
  async stop() {
    clearInterval(this.timer); this.nextCheckAt = null;
    this.controller.abort();
    await this.running;
  }
}
