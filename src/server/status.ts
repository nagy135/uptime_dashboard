import type { App } from './config.js';
import type { Evidence, Observation, Status } from '../shared/types.js';

export function httpEvidence(code: number, latencyMs: number, app: Pick<App, 'acceptedCodes' | 'protected' | 'reachabilityCodes'>): Evidence {
  const ok = app.acceptedCodes ? app.acceptedCodes.includes(code) : code >= 200 && code < 400;
  if (app.reachabilityCodes?.includes(code)) return { status: 'degraded', code, latencyMs, message: `HTTP ${code} · reachable, application health unverified` };
  if (ok) return { status: 'up', code, latencyMs, message: `HTTP ${code}` };
  if ((code === 401 || code === 403) && app.protected) {
    return { status: 'degraded', code, latencyMs, message: 'Protected endpoint · authentication required' };
  }
  return { status: 'down', code: code || undefined, latencyMs, message: code ? `HTTP ${code}` : 'Connection failed or timed out' };
}
export function overall(observation: Pick<Observation, 'http' | 'runtime'>): Status {
  const signals = [observation.http, observation.runtime].filter((e): e is Evidence => !!e);
  if (!signals.length || signals.every(s => s.status === 'unknown')) return 'unknown';
  if (signals.some(s => s.status === 'down')) return 'down';
  if (signals.some(s => s.status !== 'up')) return 'degraded';
  return 'up';
}
export function summarize(statuses: Status[]): Status {
  if (!statuses.length || statuses.every(s => s === 'unknown')) return 'unknown';
  if (statuses.every(s => s === 'down')) return 'down';
  if (statuses.some(s => s !== 'up')) return 'degraded';
  return 'up';
}
