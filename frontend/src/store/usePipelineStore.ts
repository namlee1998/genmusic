import { create } from 'zustand';
import { commitTask, checkStaleness, type StalenessResult, type VersionStatus } from '@/services/api';

// Per-task version info cached in memory
export interface TaskVersionInfo {
  taskId: string;
  versionStatus: VersionStatus;
  outputContentHash: string | null;
}

interface PipelineState {
  // Cached version status keyed by task ID
  taskVersions: Record<string, VersionStatus>;

  // Latest staleness snapshot for the active project
  staleness: StalenessResult | null;
  stalenessProjectId: string | null;
  stalenessLoading: boolean;

  // Set version status for a task (called after run or commit)
  setTaskVersionStatus: (taskId: string, status: VersionStatus) => void;

  // Commit a task (Stage Gate: user accepts and unlocks next agent)
  commit: (taskId: string) => Promise<void>;

  // Fetch staleness for a project
  fetchStaleness: (projectId: string) => Promise<StalenessResult>;

  reset: () => void;
}

export const usePipelineStore = create<PipelineState>((set) => ({
  taskVersions: {},
  staleness: null,
  stalenessProjectId: null,
  stalenessLoading: false,

  setTaskVersionStatus: (taskId, status) => {
    set((s) => ({ taskVersions: { ...s.taskVersions, [taskId]: status } }));
  },

  commit: async (taskId) => {
    const result = await commitTask(taskId);
    set((s) => ({
      taskVersions: { ...s.taskVersions, [taskId]: result.version_status },
    }));
  },

  fetchStaleness: async (projectId) => {
    set({ stalenessLoading: true });
    try {
      const data = await checkStaleness(projectId);
      set({ staleness: data, stalenessProjectId: projectId, stalenessLoading: false });
      // Sync individual task version statuses from the response
      const updates: Record<string, VersionStatus> = {};
      if (data.agent1) updates[data.agent1.taskId] = data.agent1.versionStatus;
      if (data.agent2) updates[data.agent2.taskId] = data.agent2.versionStatus;
      if (data.agent3) updates[data.agent3.taskId] = data.agent3.versionStatus;
      set((s) => {
        const next = { ...s.taskVersions };
        for (const [id, status] of Object.entries(updates)) {
          const prev = next[id];
          // Never downgrade a committed task — fetchStaleness may carry stale data
          // if it was issued before a commit resolved.
          if (prev !== 'committed') {
            next[id] = status;
          }
        }
        return { taskVersions: next };
      });
      return data;
    } catch (e) {
      set({ stalenessLoading: false });
      throw e;
    }
  },

  reset: () => set({ taskVersions: {}, staleness: null, stalenessProjectId: null, stalenessLoading: false }),
}));
