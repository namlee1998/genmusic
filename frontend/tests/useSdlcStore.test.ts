import { describe, expect, it, beforeEach } from 'vitest';
import { useSdlcStore } from '@/store/useSdlcStore';

describe('useSdlcStore', () => {
  beforeEach(() => {
    // Reset state before each test
    const { setProjectId, setArtifacts, selectArtifact, setAuditEvents, clearTask, setError } = useSdlcStore.getState();
    setProjectId(null);
    setArtifacts([]);
    selectArtifact(null);
    setAuditEvents([]);
    clearTask();
    setError(null);
  });

  it('should initialize with default state', () => {
    const state = useSdlcStore.getState();
    expect(state.projectId).toBeNull();
    expect(state.workflowStatus).toBeNull();
    expect(state.workflowLoading).toBe(false);
    expect(state.activeTaskId).toBeNull();
    expect(state.activePhase).toBeNull();
    expect(state.sseLogs).toEqual([]);
    expect(state.sseActive).toBe(false);
    expect(state.artifacts).toEqual([]);
    expect(state.selectedArtifact).toBeNull();
  });

  it('should set project id', () => {
    const { setProjectId } = useSdlcStore.getState();
    setProjectId('test-project-123');

    const state = useSdlcStore.getState();
    expect(state.projectId).toBe('test-project-123');
    expect(localStorage.getItem('sdlc_projectId')).toBe('test-project-123');
  });

  it('should set workflow status', () => {
    const { setWorkflowStatus } = useSdlcStore.getState();
    const ws = {
      projectId: 'p1',
      currentPhase: 'po-agent',
      phases: {
        intent: null,
        po: null,
        ux: null,
        dev: null,
        qa: null,
      },
    };
    setWorkflowStatus(ws);

    const state = useSdlcStore.getState();
    expect(state.workflowStatus).toEqual(ws);
  });

  it('should handle active task and append SSE logs', () => {
    const { setActiveTask, appendSseLog } = useSdlcStore.getState();
    setActiveTask('task-abc', 'po');

    let state = useSdlcStore.getState();
    expect(state.activeTaskId).toBe('task-abc');
    expect(state.activePhase).toBe('po');
    expect(state.sseActive).toBe(true);
    expect(state.sseLogs).toEqual([]);

    appendSseLog('log line 1');
    appendSseLog('log line 2');

    state = useSdlcStore.getState();
    expect(state.sseLogs).toEqual(['log line 1', 'log line 2']);
  });

  it('should handle artifacts and update content', () => {
    const { setArtifacts, selectArtifact, updateArtifactContent } = useSdlcStore.getState();
    const mockArtifacts = [
      {
        id: 'art-1',
        title: 'PRD',
        type: 'prd',
        phase: 'po-agent',
        contentText: 'Old content',
      },
      {
        id: 'art-2',
        title: 'UX Spec',
        type: 'ux_spec',
        phase: 'ux-agent',
        contentText: 'UX design text',
      },
    ];

    setArtifacts(mockArtifacts);
    selectArtifact(mockArtifacts[0]);

    let state = useSdlcStore.getState();
    expect(state.artifacts).toHaveLength(2);
    expect(state.selectedArtifact).toEqual(mockArtifacts[0]);

    updateArtifactContent('art-1', 'Updated content text');

    state = useSdlcStore.getState();
    expect(state.artifacts[0].contentText).toBe('Updated content text');
    expect(state.selectedArtifact?.contentText).toBe('Updated content text');
  });

  it('should clear active task state', () => {
    const { setActiveTask, clearTask } = useSdlcStore.getState();
    setActiveTask('task-xyz', 'ux');
    clearTask();

    const state = useSdlcStore.getState();
    expect(state.activeTaskId).toBeNull();
    expect(state.activePhase).toBeNull();
    expect(state.sseActive).toBe(false);
    expect(state.sseLogs).toEqual([]);
  });
});
