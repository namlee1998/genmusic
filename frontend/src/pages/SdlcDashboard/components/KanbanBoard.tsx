import React, { useEffect, useState } from 'react';
import { useSdlcStore } from '@/store/useSdlcStore';
import { useAppStore } from '@/store';
import { getBacklogs, moveBacklog, FeatureRequest, runIntentAgent } from '@/services/api/sdlcApi';
import { motion } from 'framer-motion';

interface BacklogItem {
  id: string;
  title: string;
  description: string;
  status: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';
  priority: string;
  task_id: string | null;
  created_at: string;
}

export default function KanbanBoard({ onRunIntent }: { onRunIntent: (feature: FeatureRequest) => void }) {
  const { currentProjectId } = useAppStore();
  const [backlogs, setBacklogs] = useState<BacklogItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchBacklogs = async () => {
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
  };

  useEffect(() => {
    void fetchBacklogs();
    
    // Auto-refresh slightly
    const interval = setInterval(fetchBacklogs, 10000);
    return () => clearInterval(interval);
  }, [currentProjectId]);

  const handleRun = async (item: BacklogItem) => {
    // Optimistic UI update
    setBacklogs((prev) => prev.map((b) => b.id === item.id ? { ...b, status: 'IN_PROGRESS' } : b));
    
    try {
      // Mark as in progress in DB
      await moveBacklog(item.id, 'IN_PROGRESS');
      // Trigger the intent agent with this feature
      onRunIntent({ title: item.title, description: item.description, priority: item.priority as any });
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
    <div className="h-full w-full flex flex-col p-6 overflow-hidden bg-transparent">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h2 className="text-[16px] font-bold text-on-surface font-headline uppercase tracking-wider">Agile Kanban Board</h2>
          <p className="text-xs text-on-surface-variant mt-1">Manage feature lifecycle across autonomous agents</p>
        </div>
        <button 
          onClick={fetchBacklogs}
          className="w-8 h-8 rounded border border-outline-variant bg-surface-container-low flex items-center justify-center hover:bg-surface-variant transition-colors"
        >
          <span className={`material-symbols-outlined text-[16px] text-on-surface-variant ${loading ? 'animate-spin' : ''}`}>refresh</span>
        </button>
      </div>

      <div className="flex-1 flex gap-6 overflow-x-auto pb-4 custom-scrollbar">
        {columns.map((col) => {
          const items = backlogs.filter((b) => b.status === col.id);
          
          return (
            <div key={col.id} className="w-[300px] shrink-0 flex flex-col bg-surface-container border border-outline-variant rounded-xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-outline-variant flex items-center justify-between bg-surface-container-high/40">
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
                      className={`p-4 rounded border bg-surface-container-lowest transition-all hover:border-primary/50 flex flex-col gap-2.5 ${
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
                          className="mt-2 w-full py-1.5 bg-primary text-on-primary hover:opacity-90 text-xs font-semibold rounded flex items-center justify-center gap-1 shadow-[0_0_10px_rgba(99,102,241,0.15)] transition-all"
                        >
                          <span className="material-symbols-outlined text-[14px]">play_arrow</span>
                          Run Agent
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
