import React, { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '@/store';
import { getBacklogs, FeatureRequest } from '@/services/api/sdlcApi';
import { motion } from 'framer-motion';
import { ArrowRight, CirclePlus, Play, RefreshCw, Sparkles } from 'lucide-react';

interface BacklogItem {
  id: string;
  title: string;
  description: string;
  status: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';
  priority: string;
  task_id: string | null;
  created_at: string;
}

export default function KanbanBoard({
  onStartPO,
  onCreateFeature,
}: {
  onStartPO: (feature: FeatureRequest, backlogId: string) => Promise<void> | void;
  onCreateFeature: () => void;
}) {
  const { currentProjectId } = useAppStore();
  const [backlogs, setBacklogs] = useState<BacklogItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchBacklogs = useCallback(async () => {
    if (!currentProjectId) return;
    setLoading(true);
    try {
      const data = await getBacklogs(currentProjectId);
      setBacklogs(data || []);
    } catch (error) {
      console.error('Failed to fetch backlogs:', error);
    } finally {
      setLoading(false);
    }
  }, [currentProjectId]);

  useEffect(() => {
    void Promise.resolve().then(fetchBacklogs);

    const handleBacklogCreated = () => void fetchBacklogs();
    window.addEventListener('backlog-created', handleBacklogCreated);

    const interval = setInterval(fetchBacklogs, 10000);
    return () => {
      window.removeEventListener('backlog-created', handleBacklogCreated);
      clearInterval(interval);
    };
  }, [fetchBacklogs]);

  const handleRun = async (item: BacklogItem) => {
    // Optimistic UI update
    setBacklogs((prev) => prev.map((b) => b.id === item.id ? { ...b, status: 'IN_PROGRESS' } : b));
    
    try {
      // Backend links the task and moves the card only after task creation succeeds.
      await onStartPO({ title: item.title, description: item.description, priority: item.priority as FeatureRequest['priority'] }, item.id);
      await fetchBacklogs();
    } catch (e) {
      console.error('Failed to run backlog item:', e);
      await fetchBacklogs();
    }
  };

  const columns: { id: BacklogItem['status']; label: string; icon: string }[] = [
    { id: 'TODO', label: 'To Do', icon: '📝' },
    { id: 'IN_PROGRESS', label: 'In Progress', icon: '⚙️' },
    { id: 'REVIEW', label: 'In Review', icon: '👀' },
    { id: 'DONE', label: 'Done', icon: '✅' },
  ];

  if (!currentProjectId) {
    return <div className="p-8 text-center text-on-surface-variant">Vui lòng chọn một dự án để xem Kanban.</div>;
  }

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-transparent">
      <div className="flex items-center justify-between gap-4 px-6 py-5 shrink-0">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Workspace</p>
          <h2 className="mt-1 text-xl font-bold text-on-surface font-headline">Feature Backlog</h2>
          <p className="mt-1 text-xs text-on-surface-variant">Create a request, then start the autonomous delivery pipeline.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCreateFeature}
            className="flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2.5 text-xs font-bold text-on-primary shadow-[0_8px_24px_rgba(99,102,241,0.18)] transition-all hover:-translate-y-0.5 hover:opacity-95"
          >
            <CirclePlus size={15} />
            New Feature Request
          </button>
          <button
            onClick={fetchBacklogs}
            title="Refresh backlog"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant bg-surface-container-low text-on-surface-variant transition-colors hover:bg-surface-variant hover:text-on-surface"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {!loading && backlogs.length === 0 && (
        <div className="mx-6 mb-4 flex items-center justify-between gap-4 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-on-surface">
          <div className="flex items-center gap-3">
            <Sparkles size={17} className="shrink-0 text-primary" />
            <div>
              <p className="font-semibold">Start by creating your first Feature Request</p>
              <p className="mt-0.5 text-xs text-on-surface-variant">It will appear in To Do, ready for PO Agent.</p>
            </div>
          </div>
          <ArrowRight size={16} className="shrink-0 text-primary" />
        </div>
      )}

      {!loading && backlogs.some((item) => item.status === 'TODO') && (
        <div className="mx-6 mb-4 flex items-center gap-3 rounded-xl border border-emerald-400/35 bg-emerald-400/10 px-4 py-3 text-sm text-on-surface">
          <Sparkles size={17} className="shrink-0 text-emerald-300" />
          <div>
            <p className="font-semibold">Ready to start the pipeline</p>
            <p className="mt-0.5 text-xs text-on-surface-variant">Click Start PO Agent on a card in the To Do column.</p>
          </div>
        </div>
      )}

      <div className="flex-1 flex gap-4 overflow-x-auto px-6 pb-6 custom-scrollbar">
        {columns.map((col) => {
          const items = backlogs.filter((b) => b.status === col.id);
          
          return (
            <div key={col.id} className="w-[290px] shrink-0 flex flex-col bg-surface-container/80 border border-outline-variant/70 rounded-xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-outline-variant/70 flex items-center justify-between bg-surface-container-high/25">
                <div className="flex items-center gap-2">
                  <span className="text-xs">{col.icon}</span>
                  <h3 className={`text-xs font-semibold uppercase tracking-wider ${col.id === 'IN_PROGRESS' ? 'text-secondary' : 'text-on-surface'}`}>{col.label}</h3>
                </div>
                <span className="text-[10px] font-label-mono bg-surface px-2 py-0.5 rounded border border-outline-variant">
                  {items.length}
                </span>
              </div>
              
              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 custom-scrollbar">
                {items.length === 0 ? (
                  <div className="text-center py-12 text-xs text-on-surface-variant/40">
                    Chưa có thẻ nào
                  </div>
                ) : (
                  items.map((item) => (
                    <motion.div
                      key={item.id}
                      layoutId={item.id}
                      className={`p-4 rounded-xl border bg-surface-container-lowest transition-all hover:-translate-y-0.5 hover:border-primary/55 hover:shadow-lg flex flex-col gap-2.5 ${
                        col.id === 'IN_PROGRESS' ? 'border-secondary/40 shadow-[0_0_10px_rgba(14,165,233,0.05)]' : 'border-outline-variant'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs font-bold text-on-surface leading-tight">{item.title}</h4>
                        <span className={`shrink-0 text-[8px] font-label-mono px-1.5 py-0.5 rounded border uppercase ${
                          item.priority === 'High' ? 'bg-error/10 text-error border-error/20' : 
                          item.priority === 'Medium' ? 'bg-warning/10 text-warning border-warning/20' : 
                          'bg-primary/10 text-primary border-primary/20'
                        }`}>
                          {item.priority}
                        </span>
                      </div>
                      {item.description && (
                        <p className="text-xs text-on-surface-variant/80 line-clamp-2 leading-relaxed">{item.description}</p>
                      )}
                      
                      {col.id === 'TODO' && (
                        <button
                          onClick={() => handleRun(item)}
                          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-xs font-bold text-on-primary shadow-[0_8px_22px_rgba(99,102,241,0.2)] transition-all hover:-translate-y-0.5 hover:opacity-95"
                        >
                          <Play size={13} fill="currentColor" />
                          Start PO Agent
                        </button>
                      )}
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
