export type Status = 'up' | 'down' | 'degraded' | 'unknown' | 'disabled';
export type CheckKind = 'http' | 'public' | 'runtime';
export interface Evidence {
  status: Status;
  latencyMs?: number;
  code?: number;
  message: string;
}
export interface Observation {
  appId: string;
  checkedAt: number;
  status: Status;
  http?: Evidence;
  public?: Evidence;
  runtime?: Evidence;
}
export interface PublicApp {
  id: string;
  name: string;
  domain?: string;
  url?: string;
  kind: 'application' | 'static' | 'external' | 'service';
  access: 'public' | 'tailscale' | 'internal';
  runtimeLabel?: string;
  status: Status;
  stale: boolean;
  latest: Observation | null;
  history: Array<{ at: number; status: Status }>;
  availability: number | null;
  coverage: number;
}
export interface Dashboard {
  generatedAt: number;
  lastCheckedAt: number | null;
  nextCheckAt: number | null;
  pollIntervalMs: number;
  staleAfterMs: number;
  inventoryUpdatedAt: string;
  devices: Array<{
    id: string;
    name: string;
    subtitle: string;
    status: Status;
    reachable: boolean | null;
    lastSeenAt: number | null;
    checkedAt: number | null;
    apps: PublicApp[];
  }>;
}
