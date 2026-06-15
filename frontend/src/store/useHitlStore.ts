import { create } from 'zustand';
import { getAllInterventions, type GlobalInterventionItem } from '@/services/api/sdlcApi';

interface HitlState {
  interventions: GlobalInterventionItem[];
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: string | null;
  fetchInterventions: () => Promise<void>;
  clearError: () => void;
}

export const useHitlStore = create<HitlState>((set) => ({
  interventions: [],
  isLoading: false,
  error: null,
  lastFetchedAt: null,

  fetchInterventions: async () => {
    set({ isLoading: true });
    try {
      const data = await getAllInterventions();
      // Sort by updatedAt descending
      const sorted = [...data].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      set({
        interventions: sorted,
        lastFetchedAt: new Date().toLocaleTimeString(),
        isLoading: false,
        error: null,
      });
    } catch (err: unknown) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load human-in-the-loop interventions',
        isLoading: false,
      });
    }
  },

  clearError: () => set({ error: null }),
}));
