import React, { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import {
  getAdminStats,
  type AdminStatsResponse,
  type AdminStatsWindow,
  type AgentLatencyStats,
  type AgentRunStats,
  type DashboardSnapshot,
  type RecentFailureRow,
  type RecentTraceRow,
} from '@/services/adminApi';
import { PaginationBar } from './PaginationBar';
import { AdminFunnel } from './AdminFunnel';

const WINDOWS: AdminStatsWindow[] = ['1d', '7d', '30d'];
const AGENT_ORDER = ['agent_1', 'agent_2', 'agent_3'];
const TABLE_LIMIT = 10;

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded border border-outline-variant/60 bg-surface-container p-4">
      <p className="mb-1 text-xs text-on-surface-variant font-medium">{label}</p>
      <p className="text-2xl font-bold font-headline text-on-surface">{value}</p>
      {sub && <p className="mt-1 text-xs text-on-surface-variant/70">{sub}</p>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant font-headline">{children}</p>;
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat().format(value);
}

function formatMs(value: number | null | undefined) {
  if (value === null || value === undefined) return '-';
  return `${formatNumber(value)} ms`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function traceLink(traceUrl: string | null) {
  if (!traceUrl) {
    return (
      <button disabled className="inline-flex items-center gap-1 rounded border border-outline-variant/30 px-2.5 py-1 text-xs text-on-surface-variant/40 cursor-not-allowed">
        <ExternalLink size={12} />
        Trace
      </button>
    );
  }

  return (
    <a
      href={traceUrl}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded border border-primary/30 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
    >
      <ExternalLink size={12} />
      Trace
    </a>
  );
}

function getAgentRows(
  runsByAgent: Record<string, AgentRunStats> = {},
  latencyByAgent: Record<string, AgentLatencyStats> = {},
) {
  const keys = Array.from(new Set([...AGENT_ORDER, ...Object.keys(runsByAgent), ...Object.keys(latencyByAgent)]));
  return keys.map((key) => ({
    key,
    runs: runsByAgent[key],
    latency: latencyByAgent[key],
    label: runsByAgent[key]?.label || latencyByAgent[key]?.label || key,
  }));
}

function FailuresTable({ rows }: { rows: RecentFailureRow[] }) {
  if (!rows.length) {
    return <p className="rounded border border-outline-variant/60 bg-surface-container p-4 text-sm text-on-surface-variant">No failed agent runs in this window</p>;
  }

  return (
    <div className="overflow-hidden rounded border border-outline-variant/60 bg-surface-container">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-container-high/60 text-xs uppercase tracking-wider text-on-surface-variant font-headline font-semibold">
          <tr>
            <th className="px-4 py-3">Agent</th>
            <th className="px-4 py-3">Task</th>
            <th className="px-4 py-3">Failed</th>
            <th className="px-4 py-3">Latency</th>
            <th className="px-4 py-3">Model</th>
            <th className="px-4 py-3">Error</th>
            <th className="px-4 py-3">Trace</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/30">
          {rows.map((row) => (
            <tr key={row.taskId} className="hover:bg-surface-container-high/30 transition-colors">
              <td className="px-4 py-3 font-semibold text-on-surface">{row.label}</td>
              <td className="px-4 py-3 font-mono text-xs text-on-surface-variant">{row.taskId.slice(0, 8)}</td>
              <td className="px-4 py-3 text-on-surface/80">{formatDate(row.failedAt)}</td>
              <td className="px-4 py-3 text-on-surface/80">{formatMs(row.latencyMs)}</td>
              <td className="px-4 py-3 text-on-surface/80">{row.model || '-'}</td>
              <td className="max-w-xs truncate px-4 py-3 text-on-surface/80" title={row.error || ''}>
                {row.error || '-'}
              </td>
              <td className="px-4 py-3">{traceLink(row.traceUrl)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TracesTable({ rows }: { rows: RecentTraceRow[] }) {
  if (!rows.length) {
    return <p className="rounded border border-outline-variant/60 bg-surface-container p-4 text-sm text-on-surface-variant">No traced agent runs in this window</p>;
  }

  return (
    <div className="overflow-hidden rounded border border-outline-variant/60 bg-surface-container">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-container-high/60 text-xs uppercase tracking-wider text-on-surface-variant font-headline font-semibold">
          <tr>
            <th className="px-4 py-3">Agent</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Time</th>
            <th className="px-4 py-3">Latency</th>
            <th className="px-4 py-3">Model</th>
            <th className="px-4 py-3">Trace</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/30">
          {rows.map((row) => (
            <tr key={row.taskId} className="hover:bg-surface-container-high/30 transition-colors">
              <td className="px-4 py-3 font-semibold text-on-surface">{row.label}</td>
              <td className="px-4 py-3 text-on-surface/80">{row.status}</td>
              <td className="px-4 py-3 text-on-surface/80">{formatDate(row.completedAt || row.failedAt)}</td>
              <td className="px-4 py-3 text-on-surface/80">{formatMs(row.latencyMs)}</td>
              <td className="px-4 py-3 text-on-surface/80">{row.model || '-'}</td>
              <td className="px-4 py-3">{traceLink(row.traceUrl)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminDashboard() {
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [window, setWindow] = useState<AdminStatsWindow>('7d');
  const [failuresOffset, setFailuresOffset] = useState(0);
  const [tracesOffset, setTracesOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getAdminStats(window, {
      failuresLimit: TABLE_LIMIT,
      failuresOffset,
      tracesLimit: TABLE_LIMIT,
      tracesOffset,
    })
      .then(setStats)
      .finally(() => setLoading(false));
  }, [window, failuresOffset, tracesOffset]);

  const snap = stats?.[window] as DashboardSnapshot | undefined;
  const d = snap?.data;
  const live = stats?.live;
  const agentRows = getAgentRows(live?.runsByAgent, live?.latencyByAgent);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold font-headline text-on-surface">Dashboard</h2>
        <div className="flex gap-1 bg-surface-container border border-outline-variant/40 rounded p-1">
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => {
                setFailuresOffset(0);
                setTracesOffset(0);
                setWindow(w);
              }}
              className={`rounded px-3 py-1 text-xs font-semibold transition-all ${
                window === w
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/50'
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="text-sm text-on-surface-variant">Loading...</p>}

      {!loading && !d && (
        <p className="text-sm text-on-surface-variant">No snapshot data yet. Check back after the hourly batch job runs.</p>
      )}

      {!loading && (
        <>
          <div>
            <SectionTitle>Overview</SectionTitle>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <StatCard label="Total users" value={formatNumber(d?.total_users)} />
              <StatCard label="Active users" value={formatNumber(live?.activeUsers ?? d?.active_users)} sub={`in last ${window}`} />
              <StatCard label="Total runs" value={formatNumber(d?.total_runs)} />
              <StatCard label="Failed runs" value={formatNumber(d?.failed_runs)} />
              <StatCard label="Credits used" value={formatNumber(live?.credits ?? d?.total_credits)} />
            </div>
          </div>

          {d && (
            <div>
              <SectionTitle>Users By Plan</SectionTitle>
              <div className="flex flex-wrap gap-3">
                {Object.entries(d.users_by_plan).map(([plan, count]) => (
                  <div key={plan} className="rounded border border-outline-variant/60 bg-surface-container px-5 py-3 text-center min-w-[120px]">
                    <p className="text-xs capitalize text-on-surface-variant font-medium">{plan}</p>
                    <p className="text-xl font-bold font-headline text-on-surface mt-0.5">{count}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <SectionTitle>Agent Health</SectionTitle>
            <div className="overflow-hidden rounded border border-outline-variant/60 bg-surface-container">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-container-high/60 text-xs uppercase tracking-wider text-on-surface-variant font-headline font-semibold">
                  <tr>
                    <th className="px-4 py-3">Agent</th>
                    <th className="px-4 py-3">Runs</th>
                    <th className="px-4 py-3">Success rate</th>
                    <th className="px-4 py-3">Failure rate</th>
                    <th className="px-4 py-3">Avg latency</th>
                    <th className="px-4 py-3">P95 latency</th>
                    <th className="px-4 py-3">Max latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {agentRows.map(({ key, label, runs, latency }) => (
                    <tr key={key} className="hover:bg-surface-container-high/30 transition-colors">
                      <td className="px-4 py-3 font-semibold text-on-surface">{label}</td>
                      <td className="px-4 py-3 text-on-surface-variant">{formatNumber(runs?.total ?? 0)}</td>
                      <td className="px-4 py-3 text-on-surface-variant font-medium">
                        <span className="text-green-500">{runs ? `${runs.successRate}%` : '0%'}</span>
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant font-medium">
                        <span className={runs && runs.failureRate > 0 ? 'text-red-500' : 'text-on-surface-variant'}>
                          {runs ? `${runs.failureRate}%` : '0%'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant">{formatMs(latency?.avg)}</td>
                      <td className="px-4 py-3 text-on-surface-variant">{formatMs(latency?.p95)}</td>
                      <td className="px-4 py-3 text-on-surface-variant">{formatMs(latency?.max)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <SectionTitle>Usage & Cost</SectionTitle>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <StatCard label="Input tokens" value={formatNumber(live?.tokens.input)} />
              <StatCard label="Output tokens" value={formatNumber(live?.tokens.output)} />
              <StatCard label="Total tokens" value={formatNumber(live?.tokens.total)} />
              <StatCard label="Credits" value={formatNumber(live?.credits)} />
              <StatCard label="Active projects" value={formatNumber(live?.activeProjects)} />
            </div>
          </div>

          <div>
            <SectionTitle>Recent Issues</SectionTitle>
            <FailuresTable rows={stats?.recentFailures.rows || []} />
            {stats?.recentFailures && stats.recentFailures.count > stats.recentFailures.limit && (
              <PaginationBar
                className="mt-2"
                count={stats.recentFailures.count}
                limit={stats.recentFailures.limit}
                offset={stats.recentFailures.offset}
                onPrev={() => setFailuresOffset((o) => Math.max(0, o - TABLE_LIMIT))}
                onNext={() => setFailuresOffset((o) => o + TABLE_LIMIT)}
              />
            )}
          </div>

          <div>
            <SectionTitle>Recent Traces</SectionTitle>
            <TracesTable rows={stats?.recentTraces.rows || []} />
            {stats?.recentTraces && stats.recentTraces.count > stats.recentTraces.limit && (
              <PaginationBar
                className="mt-2"
                count={stats.recentTraces.count}
                limit={stats.recentTraces.limit}
                offset={stats.recentTraces.offset}
                onPrev={() => setTracesOffset((o) => Math.max(0, o - TABLE_LIMIT))}
                onNext={() => setTracesOffset((o) => o + TABLE_LIMIT)}
              />
            )}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-on-surface-variant/60 font-mono">
            {snap && <p>Snapshot at: {formatDate(snap.snapshot_at)}</p>}
            {live && <p>Live metrics updated: {formatDate(live.updatedAt)}</p>}
          </div>
        </>
      )}

      <AdminFunnel />
    </div>
  );
}
