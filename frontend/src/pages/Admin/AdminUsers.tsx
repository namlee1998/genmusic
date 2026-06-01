import React, { useCallback, useEffect, useState } from 'react';
import {
  listAdminUsers,
  getAdminUserDetail,
  changeUserPlan,
  suspendUser,
  unsuspendUser,
  resetUserCredits,
  type AdminUserRow,
  type AdminUserDetail,
} from '@/services/adminApi';
import { PaginationBar } from './PaginationBar';

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500/10 text-green-400 border border-green-500/20',
  quota_exceeded: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  suspended: 'bg-red-500/10 text-red-400 border border-red-500/20',
  expired: 'bg-surface-container-high text-on-surface-variant/80 border border-outline-variant/30',
};

const PLANS = ['free', 'pro'];
const USER_LIMIT = 20;
const USAGE_LIMIT = 10;

function ExpandedRow({
  userId,
  onRefresh,
}: {
  userId: string;
  onRefresh: () => void;
}) {
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [usageOffset, setUsageOffset] = useState(0);

  const load = useCallback(async () => {
    const result = await getAdminUserDetail(userId, { usageLimit: USAGE_LIMIT, usageOffset });
    if (result.recentUsage.rows.length === 0 && result.recentUsage.count > 0 && usageOffset > 0) {
      setUsageOffset((o) => Math.max(0, o - USAGE_LIMIT));
      return;
    }
    setDetail(result);
  }, [userId, usageOffset]);

  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); await load(); onRefresh(); } finally { setBusy(false); }
  };

  if (!detail) {
    return (
      <tr>
        <td colSpan={5} className="px-6 py-4 bg-[#050505] border-b border-outline-variant/30">
          <p className="text-xs text-on-surface-variant/60">Loading...</p>
        </td>
      </tr>
    );
  }

  const sub = detail.subscription;
  const isSuspended = sub.status === 'suspended';
  const creditPct = sub.creditsTotal > 0 ? Math.round((sub.creditsUsed / sub.creditsTotal) * 100) : 0;

  return (
    <tr>
      <td colSpan={5} className="bg-[#050505] border-b border-outline-variant/40 px-6 py-4">
        <div className="flex gap-6 flex-wrap">

          {/* Subscription info */}
          <div className="min-w-[180px] space-y-2">
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Subscription</p>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-on-surface-variant">Plan</span>
              <span className="font-semibold capitalize text-on-surface">{sub.planId}</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-on-surface-variant">Status</span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[sub.status] || ''}`}>
                {sub.status}
              </span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-on-surface-variant">Credits</span>
                <span className="font-semibold text-on-surface">{sub.creditsUsed} / {sub.creditsTotal}</span>
              </div>
              <div className="h-1.5 bg-surface-container rounded overflow-hidden border border-outline-variant/20">
                <div
                  className={`h-full rounded ${creditPct >= 90 ? 'bg-error' : creditPct >= 70 ? 'bg-warning' : 'bg-primary'}`}
                  style={{ width: `${Math.min(creditPct, 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="w-px bg-outline-variant/30 self-stretch hidden sm:block" />

          {/* Actions */}
          <div className="min-w-[200px] space-y-2">
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Actions</p>
            <div className="flex gap-1.5">
              {PLANS.map((p) => (
                <button
                  key={p}
                  disabled={busy || sub.planId === p}
                  onClick={() => act(() => changeUserPlan(detail.userId, p))}
                  className={`px-3 py-1 rounded text-xs font-semibold border transition-all
                    ${sub.planId === p
                      ? 'bg-primary text-on-primary border-primary shadow-[0_0_8px_rgba(99,102,241,0.2)]'
                      : 'border-outline-variant/60 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                    } disabled:opacity-50`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
            <button
              disabled={busy}
              onClick={() => act(() => resetUserCredits(detail.userId))}
              className="block w-full text-left px-3 py-1.5 rounded text-xs font-semibold border border-outline-variant/60 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface disabled:opacity-50 transition-colors"
            >
              Reset credits
            </button>
            {isSuspended ? (
              <button
                disabled={busy}
                onClick={() => act(() => unsuspendUser(detail.userId))}
                className="block w-full text-left px-3 py-1.5 rounded text-xs font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                Unsuspend
              </button>
            ) : (
              <button
                disabled={busy}
                onClick={() => act(() => suspendUser(detail.userId))}
                className="block w-full text-left px-3 py-1.5 rounded text-xs font-semibold bg-red-950/20 text-error border border-error/30 hover:bg-red-900/20 disabled:opacity-50 transition-colors"
              >
                Suspend
              </button>
            )}
          </div>

          {/* Divider */}
          <div className="w-px bg-outline-variant/30 self-stretch hidden sm:block" />

          {/* Recent usage */}
          <div className="flex-1 min-w-[240px] space-y-2">
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Recent Usage</p>
            {detail.recentUsage.rows.length === 0 ? (
              <p className="text-xs text-on-surface-variant/60">No usage yet.</p>
            ) : (
              <div className="space-y-1">
                {detail.recentUsage.rows.map((u) => (
                  <div key={u.id} className="grid grid-cols-4 text-xs text-on-surface-variant py-1 border-b border-outline-variant/20 last:border-0">
                    <span className="font-medium text-on-surface">{u.agentType}</span>
                    <span className={u.status === 'completed' ? 'text-green-400 font-semibold' : 'text-error font-semibold'}>{u.status}</span>
                    <span className="font-semibold text-on-surface">{u.creditsCharged} cr</span>
                    <span className="text-on-surface-variant/60 text-right font-mono">{new Date(u.executedAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
            {detail.recentUsage.count > detail.recentUsage.limit && (
              <PaginationBar
                className="mt-2"
                count={detail.recentUsage.count}
                limit={detail.recentUsage.limit}
                offset={detail.recentUsage.offset}
                onPrev={() => setUsageOffset((o) => Math.max(0, o - USAGE_LIMIT))}
                onNext={() => setUsageOffset((o) => o + USAGE_LIMIT)}
              />
            )}
          </div>

        </div>
      </td>
    </tr>
  );
}

export function AdminUsers() {
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [count, setCount] = useState(0);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const limit = USER_LIMIT;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listAdminUsers({
        limit,
        offset,
        plan_id: planFilter || undefined,
        status: statusFilter || undefined,
        search: search || undefined,
      });
      setRows(result.rows);
      setCount(result.count);
    } finally {
      setLoading(false);
    }
  }, [offset, planFilter, statusFilter, search, limit]);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = (userId: string) => {
    setExpandedUserId((prev) => (prev === userId ? null : userId));
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold font-headline text-on-surface">
          Users <span className="text-on-surface-variant/60 font-normal text-sm">({count})</span>
        </h2>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <input
          type="text"
          placeholder="Search email or name..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
          className="border border-outline-variant/60 bg-surface-container rounded px-3 py-1.5 text-xs w-60 text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-secondary/40 focus:border-secondary outline-none transition-all"
        />
        <select
          value={planFilter}
          onChange={(e) => { setPlanFilter(e.target.value); setOffset(0); }}
          className="border border-outline-variant/60 bg-surface-container rounded px-3 py-1.5 text-xs text-on-surface focus:outline-none focus:border-secondary transition-all"
        >
          <option value="">All plans</option>
          <option value="free">Free</option>
          <option value="pro">Pro</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setOffset(0); }}
          className="border border-outline-variant/60 bg-surface-container rounded px-3 py-1.5 text-xs text-on-surface focus:outline-none focus:border-secondary transition-all"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="quota_exceeded">Quota exceeded</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-surface-container rounded border border-outline-variant/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-container-high/60 border-b border-outline-variant/30">
            <tr>
              <th className="text-left text-xs font-semibold text-on-surface-variant px-4 py-3 w-6"></th>
              <th className="text-left text-xs font-semibold text-on-surface-variant px-4 py-3 font-headline uppercase tracking-wider">User</th>
              <th className="text-left text-xs font-semibold text-on-surface-variant px-4 py-3 font-headline uppercase tracking-wider">Plan</th>
              <th className="text-left text-xs font-semibold text-on-surface-variant px-4 py-3 font-headline uppercase tracking-wider">Status</th>
              <th className="text-left text-xs font-semibold text-on-surface-variant px-4 py-3 font-headline uppercase tracking-wider">Credits</th>
              <th className="text-left text-xs font-semibold text-on-surface-variant px-4 py-3 font-headline uppercase tracking-wider">Joined</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="text-center text-on-surface-variant text-xs py-8">Loading...</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="text-center text-on-surface-variant text-xs py-8">No users found.</td></tr>
            )}
            {rows.map((r) => (
              <React.Fragment key={r.userId}>
                <tr
                  onClick={() => toggleExpand(r.userId)}
                  className={`border-b border-outline-variant/20 hover:bg-surface-container-high/30 cursor-pointer transition-colors ${
                    expandedUserId === r.userId ? 'bg-surface-container-high/40 border-outline-variant/40' : ''
                  }`}
                >
                  <td className="px-4 py-3 text-on-surface-variant/60 text-xs">
                    <span className={`inline-block transition-transform duration-150 ${expandedUserId === r.userId ? 'rotate-90 text-primary' : ''}`}>
                      ▶
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-on-surface">{r.email || '—'}</p>
                    {r.fullName && <p className="text-xs text-on-surface-variant/70">{r.fullName}</p>}
                  </td>
                  <td className="px-4 py-3 capitalize text-on-surface">{r.planId}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[r.status] || ''}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-on-surface font-semibold">{r.creditsUsed}/{r.creditsTotal}</td>
                  <td className="px-4 py-3 text-on-surface-variant/60 text-xs font-mono">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                </tr>
                {expandedUserId === r.userId && (
                  <ExpandedRow userId={r.userId} onRefresh={load} />
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <PaginationBar
        count={count}
        limit={limit}
        offset={offset}
        onPrev={() => setOffset((o) => Math.max(0, o - limit))}
        onNext={() => setOffset((o) => o + limit)}
      />
    </div>
  );
}
