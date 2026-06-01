import React, { useEffect } from 'react';
import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { useAdminStore } from '@/store/useAdminStore';
import { useTheme } from '@/theme';
import { AdminLogin } from './AdminLogin';
import { AdminDashboard } from './AdminDashboard';
import { AdminUsers } from './AdminUsers';

function AdminShell() {
  const { token, admin, logout } = useAdminStore();
  const navigate = useNavigate();
  const { resolvedMode, toggleMode } = useTheme();

  if (!token) return <Navigate to="/admin/login" replace />;

  return (
    <div className="min-h-screen bg-background text-on-surface flex">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 w-52 bg-surface-container border-r border-outline-variant flex flex-col">
        <div className="p-5 border-b border-outline-variant">
          <p className="text-xs font-bold text-primary uppercase tracking-widest font-label-mono">AIDLC Admin</p>
          <p className="text-[10px] text-on-surface-variant font-label-mono mt-0.5 truncate">{admin?.email}</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {[
            { to: '/admin/dashboard', label: 'Dashboard', icon: 'dashboard' },
            { to: '/admin/users', label: 'Users', icon: 'group' },
          ].map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded border text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-primary/10 border-primary/30 text-primary shadow-[0_0_8px_rgba(99,102,241,0.15)]'
                    : 'text-on-surface-variant border-transparent hover:bg-surface-variant hover:text-on-surface'
                }`
              }
            >
              <span className="material-symbols-outlined text-base">{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-outline-variant space-y-1">
          <button
            onClick={toggleMode}
            className="flex items-center gap-2.5 px-3 py-2 w-full rounded border border-transparent text-xs font-semibold text-on-surface-variant hover:bg-surface-variant hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined text-base">
              {resolvedMode === 'dark' ? 'light_mode' : 'dark_mode'}
            </span>
            <span>{resolvedMode === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>
          <button
            onClick={() => { logout(); navigate('/admin/login'); }}
            className="flex items-center gap-2.5 px-3 py-2 w-full rounded border border-transparent text-xs font-semibold text-on-surface-variant hover:bg-surface-variant hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined text-base">logout</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="ml-52 flex-1 min-w-0 bg-background min-h-screen">
        <Routes>
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export function AdminApp() {
  const init = useAdminStore((s) => s.init);
  useEffect(() => { init(); }, [init]);

  return (
    <Routes>
      <Route path="login" element={<AdminLoginRedirect />} />
      <Route path="*" element={<AdminShell />} />
    </Routes>
  );
}

function AdminLoginRedirect() {
  const token = useAdminStore((s) => s.token);
  const init = useAdminStore((s) => s.init);
  useEffect(() => { init(); }, [init]);

  if (token) return <Navigate to="/admin/dashboard" replace />;
  return <AdminLogin />;
}
