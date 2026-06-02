import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store';
import { listMyInvitations, acceptInvitation, type ProjectInvitationItem } from '@/services/api';

export function InvitationsBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [invitations, setInvitations] = useState<ProjectInvitationItem[]>([]);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { fetchTree, setCurrentProject } = useAppStore();

  const load = async () => {
    try {
      const rows = await listMyInvitations();
      setInvitations(rows);
    } catch { /* non-fatal */ }
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [message]);

  const handleAccept = async (inv: ProjectInvitationItem) => {
    setAccepting(inv.invitation_id);
    setMessage(null);
    try {
      const accepted = await acceptInvitation({ invitation_id: inv.invitation_id });
      await fetchTree();
      setCurrentProject(inv.project_id);
      await load();
      setMessage(`Đã tham gia ${accepted.project_name || inv.project_name || 'project'}`);
      setOpen(false);
      navigate('/app');
    } catch {
      setMessage('Không thể chấp nhận lời mời');
    } finally {
      setAccepting(null);
    }
  };

  const count = invitations.length;

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen((v) => !v); if (!open) void load(); }}
        className="relative w-8 h-8 rounded-xl border border-outline-variant/20 bg-surface-container-low flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors"
      >
        <span className="material-symbols-outlined text-[18px]">notifications</span>
        {count > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-error text-white text-[9px] font-bold flex items-center justify-center px-1">
            {count}
          </span>
        )}
      </button>

      {message && (
        <div className="absolute right-0 top-10 z-50 w-72 rounded-xl border border-primary/20 bg-surface-container-lowest px-3 py-2 text-xs font-semibold text-on-surface shadow-xl">
          {message}
        </div>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 w-80 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/20">
              <span className="text-sm font-bold text-on-surface">Lời mời tham gia</span>
              <button onClick={() => setOpen(false)} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
            {invitations.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-on-surface-variant">Không có lời mời nào.</p>
            ) : (
              <ul className="max-h-72 overflow-y-auto divide-y divide-outline-variant/20">
                {invitations.map((inv) => (
                  <li key={inv.invitation_id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-on-surface truncate">
                        {inv.project_name || `Project ${inv.project_id.slice(0, 8)}`}
                      </p>
                      <p className="text-[10px] text-on-surface-variant">Vai trò: <span className="uppercase">{inv.role}</span></p>
                    </div>
                    <button
                      disabled={accepting === inv.invitation_id}
                      onClick={() => void handleAccept(inv)}
                      className="shrink-0 rounded-lg bg-primary px-2 py-1 text-[10px] font-bold text-on-primary disabled:opacity-50"
                    >
                      {accepting === inv.invitation_id ? '...' : 'Chấp nhận'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
