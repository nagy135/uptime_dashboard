import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Globe2,
  Layers3,
  Radio,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Terminal,
  Zap,
} from 'lucide-react';
import type { Dashboard, Evidence, PublicApp, Status } from '../shared/types';

const labels: Record<Status, string> = {
  up: 'Operational',
  down: 'Down',
  degraded: 'Degraded',
  unknown: 'Unknown',
};
const age = (time: number | null | undefined, now: number) =>
  !time
    ? 'Not checked'
    : now - time < 5000
      ? 'Just now'
      : now - time < 60000
        ? `${Math.floor((now - time) / 1000)}s ago`
        : now - time < 3600000
          ? `${Math.floor((now - time) / 60000)}m ago`
          : `${Math.floor((now - time) / 3600000)}h ago`;
function Badge({ status, label }: { status: Status; label?: string }) {
  return (
    <span className={`badge ${status}`}>
      <i />
      {label || labels[status]}
    </span>
  );
}
function EvidenceRow({ title, evidence }: { title: string; evidence?: Evidence }) {
  return (
    <div className="evidence">
      <span>{title}</span>
      {evidence ? (
        <>
          <Badge status={evidence.status} label={evidence.message} />
          {evidence.latencyMs !== undefined && <small>{evidence.latencyMs} ms</small>}
        </>
      ) : (
        <small>Not configured</small>
      )}
    </div>
  );
}
function AppRow({ app, now }: { app: PublicApp; now: number }) {
  const stale = app.stale || (!!app.latest && now - app.latest.checkedAt > 90_000);
  const status = stale ? 'unknown' : app.status;
  return (
    <details className="app-row">
      <summary>
        <div className={`app-icon ${app.kind === 'service' ? 'internal' : ''}`}>
          {app.kind === 'service' ? (
            <Terminal size={17} />
          ) : app.kind === 'static' ? (
            <Layers3 size={17} />
          ) : (
            <Globe2 size={17} />
          )}
        </div>
        <div className="app-name">
          <strong>{app.name}</strong>
          <span>
            {app.domain || 'Internal service'}
            {app.latest?.public?.status === 'down' && status === 'up' && <em>Public issue</em>}
          </span>
        </div>
        <div className="row-status">
          <Badge
            status={status}
            label={stale && app.latest ? 'Stale' : !app.latest ? 'Not checked' : undefined}
          />
        </div>
        <div className="latency">
          {app.latest?.http?.latencyMs !== undefined && !stale ? (
            <>
              {app.latest.http.latencyMs}
              <small> ms</small>
            </>
          ) : (
            <span className="muted">—</span>
          )}
        </div>
        <div className="history" aria-label="Availability over the last 30 minutes">
          {app.history.map((point, i) => (
            <i
              key={point.at}
              className={point.status}
              title={`${new Date(point.at).toLocaleTimeString()} · ${labels[point.status]}`}
              style={{ opacity: i === 59 ? 0.7 : 1 }}
            />
          ))}
        </div>
        <div
          className="availability"
          title={`Successful checks over the last 24 hours. ${app.coverage}% monitoring coverage.`}
        >
          {app.availability === null ? '—' : `${app.availability}%`}
        </div>
        <ChevronDown className="row-chevron" size={15} />
      </summary>
      <div className="app-detail">
        <div>
          <EvidenceRow title="On device" evidence={app.latest?.http} />
          <EvidenceRow title="Public URL" evidence={app.latest?.public} />
          <EvidenceRow title={app.runtimeLabel || 'Runtime'} evidence={app.latest?.runtime} />
        </div>
        <div className="detail-meta">
          <span>Checked {age(app.latest?.checkedAt, now)}</span>
          <span>24h coverage: {app.coverage}%</span>
          {app.url && (
            <a href={app.url} target="_blank" rel="noreferrer">
              Open application <ArrowUpRight size={14} />
            </a>
          )}
        </div>
      </div>
    </details>
  );
}
function DeviceSection({
  device,
  query,
  onlyIssues,
  now,
}: {
  device: Dashboard['devices'][number];
  query: string;
  onlyIssues: boolean;
  now: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const matches = device.apps.filter(
    (a) =>
      `${a.name} ${a.domain || ''}`.toLowerCase().includes(query.toLowerCase()) &&
      (!onlyIssues ||
        a.status !== 'up' ||
        a.stale ||
        (!!a.latest && now - a.latest.checkedAt > 90_000)),
  );
  const visible = expanded || query || onlyIssues ? matches : matches.slice(0, 7);
  return (
    <section className="device-section" id={device.id}>
      <header className="section-head">
        <div className="device-heading">
          <span className="server-icon">
            <Server size={20} />
          </span>
          <div>
            <h2>
              {device.name}
              <span>{device.apps.length} monitors</span>
            </h2>
            <p>{device.subtitle}</p>
          </div>
        </div>
        <span className={`connection ${device.reachable ? 'connected' : ''}`}>
          <i />
          {device.checkedAt && now - device.checkedAt > 90_000
            ? 'Collection stale'
            : device.reachable
              ? 'Connected'
              : device.reachable === false
                ? 'Connection unavailable'
                : 'Awaiting first check'}
        </span>
      </header>
      <div className="table-head">
        <span>APPLICATION / SERVICE</span>
        <span>STATUS</span>
        <span>RESPONSE</span>
        <span>LAST 30 MINUTES</span>
        <span>24H SUCCESS</span>
      </div>
      {visible.map((app) => (
        <AppRow key={app.id} app={app} now={now} />
      ))}
      {!matches.length && (
        <div className="empty">
          {query || onlyIssues
            ? 'No monitors match these filters.'
            : 'No applications configured on this device.'}
        </div>
      )}
      {device.apps.every((a) => a.kind === 'service') && !query && (
        <p className="service-note">No web applications configured. Monitoring system services.</p>
      )}
      {matches.length > 7 && !query && !onlyIssues && (
        <button className="show-more" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show fewer monitors' : `Show all ${matches.length} monitors`}
          <ChevronDown size={14} className={expanded ? 'rotate' : ''} />
        </button>
      )}
    </section>
  );
}
export function App() {
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState('');
  const [deviceFilter, setDeviceFilter] = useState('all');
  const [onlyIssues, setOnlyIssues] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const { data, error, isFetching, refetch } = useQuery<Dashboard>({
    queryKey: ['status'],
    queryFn: async () => {
      const res = await fetch('/api/status');
      if (!res.ok) throw new Error('Status data is unavailable');
      return res.json();
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  });
  const apps = data?.devices.flatMap((d) => d.apps) || [];
  const fresh = (a: PublicApp) => !a.stale && !!a.latest && now - a.latest.checkedAt <= 90_000;
  const up = apps.filter((a) => fresh(a) && a.status === 'up').length;
  const issues = apps.filter((a) => fresh(a) && ['down', 'degraded'].includes(a.status)).length;
  const pending = apps.length - up - issues;
  const latencies = apps
    .filter((a) => fresh(a) && a.latest?.http?.status === 'up')
    .map((a) => a.latest!.http!.latencyMs!)
    .filter((n) => n !== undefined);
  const average = latencies.length
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : null;
  const allStale = !!data?.lastCheckedAt && now - data.lastCheckedAt > data.staleAfterMs;
  const title =
    !data || !data.lastCheckedAt
      ? 'Getting a pulse on your fleet'
      : allStale
        ? 'Waiting for fresh observations'
        : issues
          ? 'A few things need attention'
          : pending
            ? 'Some monitors are awaiting data'
            : 'All systems operational';
  return (
    <div className="layout">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span>
            <Activity size={22} />
          </span>
          infiniter<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">YOUR INFRASTRUCTURE</div>
        <button
          className={`nav-item ${deviceFilter === 'all' ? 'selected' : ''}`}
          onClick={() => setDeviceFilter('all')}
        >
          <Layers3 size={17} />
          Overview<span>{data?.devices.length || 3}</span>
        </button>
        <div className="workspace-label fleet-label">FLEET DEVICES</div>
        {data?.devices.map((device) => (
          <button
            key={device.id}
            className={`nav-item ${deviceFilter === device.id ? 'selected' : ''}`}
            onClick={() => setDeviceFilter(device.id)}
          >
            <Server size={16} />
            {device.name}
            <i
              className={`nav-dot ${device.checkedAt && now - device.checkedAt <= 90_000 ? device.status : 'unknown'}`}
            />
          </button>
        ))}
        <div className="sidebar-bottom">
          <div className="public-label">
            <Globe2 size={15} />
            Public status page
          </div>
          <p>
            A little peace of mind,
            <br />
            every 30 seconds.
          </p>
          <span className="version">FLEET MONITOR / 01</span>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div>
            <span>Workspace</span>
            <span className="slash">/</span>
            <strong>Fleet overview</strong>
          </div>
          <span className="live-label">
            <Radio size={14} />
            LIVE MONITORING
          </span>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">INFRASTRUCTURE AT A GLANCE</div>
              <h1>
                Fleet status<span>.</span>
              </h1>
              <p>Your applications, across every device. One clear picture.</p>
            </div>
            <button className="refresh" onClick={() => void refetch()} disabled={isFetching}>
              <RefreshCw size={15} className={isFetching ? 'spinning' : ''} />
              Refresh view
            </button>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              Unable to refresh status.{' '}
              {data
                ? 'Showing the last available data.'
                : 'Check that the dashboard server is running.'}
              <button onClick={() => void refetch()}>Try again</button>
            </div>
          )}
          <div className={`health-banner ${issues || allStale ? 'attention' : ''}`}>
            <span className="banner-icon">
              {issues || allStale ? <Activity size={22} /> : <ShieldCheck size={22} />}
            </span>
            <div>
              <strong>{title}</strong>
              <p>
                {data?.lastCheckedAt
                  ? `${up} operational · ${issues} need attention · ${pending} unknown`
                  : 'The first collection will appear here shortly.'}
              </p>
            </div>
            <div className="last-checked">
              <span>LAST COLLECTION</span>
              <strong>{age(data?.lastCheckedAt, now)}</strong>
            </div>
          </div>
          <div className="stats">
            <div className="stat">
              <span>
                Total monitors
                <Layers3 size={16} />
              </span>
              <strong>
                {data ? apps.length : '—'}
                <small>across {data?.devices.length || 3} devices</small>
              </strong>
              <p>Applications & system services</p>
            </div>
            <div className="stat">
              <span>
                Operational
                <Check size={17} />
              </span>
              <strong className="green">
                {data ? up : '—'}
                <small className="green">responding normally</small>
              </strong>
              <p>Device HTTP and runtime checks</p>
            </div>
            <div className="stat">
              <span>
                Needs attention
                <Activity size={17} />
              </span>
              <strong className={issues ? 'amber' : ''}>
                {data ? issues : '—'}
                <small>down or degraded</small>
              </strong>
              <p>{pending} awaiting a confirmed status</p>
            </div>
            <div className="stat">
              <span>
                Average response
                <Zap size={17} />
              </span>
              <strong>
                {average ?? '—'}
                <small>ms</small>
              </strong>
              <p>Healthy HTTP endpoints</p>
            </div>
          </div>
          <div className="toolbar">
            <div className="view-title">
              <h2>Your fleet</h2>
              <span>{data?.devices.length || 3} devices</span>
            </div>
            <div className="filters">
              <label className="search">
                <Search size={15} />
                <input
                  aria-label="Search monitors"
                  placeholder="Find an application…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <button
                className={`issue-filter ${onlyIssues ? 'active' : ''}`}
                onClick={() => setOnlyIssues(!onlyIssues)}
                aria-pressed={onlyIssues}
              >
                Needs attention{onlyIssues && <Check size={13} />}
              </button>
            </div>
          </div>
          {!data && !error && (
            <div className="loading">
              <Activity size={24} />
              <p>Loading fleet observations…</p>
            </div>
          )}
          {data?.devices
            .filter((d) => deviceFilter === 'all' || deviceFilter === d.id)
            .map((device) => (
              <DeviceSection
                key={device.id}
                device={device}
                query={query}
                onlyIssues={onlyIssues}
                now={now}
              />
            ))}
          <div className="legend">
            <span>
              <i className="up" />
              Operational
            </span>
            <span>
              <i className="down" />
              Down
            </span>
            <span>
              <i className="degraded" />
              Degraded
            </span>
            <span>
              <i className="unknown" />
              No observation
            </span>
            <span className="legend-help">
              <CircleHelp size={13} />
              Select a row for check details
            </span>
          </div>
          <footer>
            <span>
              <Clock3 size={13} />
              Checks & view refresh every 30 seconds
            </span>
            <span>24h success excludes missing observations · coverage in details</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
