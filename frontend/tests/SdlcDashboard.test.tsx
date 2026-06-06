import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import SdlcDashboard from '@/pages/SdlcDashboard';
import { useAppStore } from '@/store/useAppStore';
import { useSdlcStore } from '@/store/useSdlcStore';
import * as sdlcApi from '@/services/api/sdlcApi';

// Mock stores
vi.mock('@/store/useAppStore', () => ({
  useAppStore: vi.fn(),
}));

vi.mock('@/store/useSdlcStore', () => ({
  useSdlcStore: vi.fn(),
}));

// Mock API
vi.mock('@/services/api/sdlcApi', () => ({
  getPipelineStatus: vi.fn(),
  resolveGate: vi.fn(),
  releaseDecision: vi.fn(),
  subscribeWorkflowSSE: vi.fn(),
  startPipeline: vi.fn(),
}));

describe('SdlcDashboard Component', () => {
  const mockUseAppStore = useAppStore as unknown as Mock;
  const mockUseSdlcStore = useSdlcStore as unknown as Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseAppStore.mockReturnValue({
      currentProjectId: 'project-123',
      treeLoaded: true,
      fetchTree: vi.fn(),
    });

    mockUseSdlcStore.mockReturnValue({
      projectId: 'project-123',
      workflowId: 'project-123',
      status: 'idle',
      routeType: 'FULLSTACK',
      pipelinePhases: [
        { agent: 'PO', status: 'pending' },
        { agent: 'UX', status: 'pending' },
        { agent: 'DEV', status: 'pending' },
        { agent: 'QA', status: 'pending' }
      ],
      pendingGates: [],
      gateHistory: [],
      auditLog: [],
      qaResult: null,
      releaseStatus: 'pending',
      repoUrl: '',
      featureRequest: 'add google login',
      isLoading: false,
      error: null,
      pollStatus: vi.fn(),
      startPipeline: vi.fn(),
      resolveGate: vi.fn(),
      releaseDecision: vi.fn(),
      setProjectId: vi.fn(),
      setError: vi.fn(),
    });
  });

  it('renders the core dashboard header when loaded', () => {
    render(
      <MemoryRouter>
        <SdlcDashboard />
      </MemoryRouter>
    );
    expect(screen.getByText('SDLC Control Center')).toBeInTheDocument();
    expect(screen.getByText(/Risk-based pipeline control with autonomous developer agents/i)).toBeInTheDocument();
  });

  it('renders the Repository & Feature Integration input form', () => {
    render(
      <MemoryRouter>
        <SdlcDashboard />
      </MemoryRouter>
    );
    expect(screen.getByText('Repository & Feature Integration')).toBeInTheDocument();
    expect(screen.getByText('🔗 REPOSITORY URL')).toBeInTheDocument();
    expect(screen.getByText('📝 FEATURE REQUEST')).toBeInTheDocument();
  });

  it('renders the Pipeline Stepper when pipeline starts running', () => {
    mockUseSdlcStore.mockReturnValue({
      projectId: 'project-123',
      workflowId: 'project-123',
      status: 'dev_running',
      routeType: 'BACKEND',
      pipelinePhases: [
        { agent: 'PO', status: 'completed' },
        { agent: 'UX', status: 'skipped' },
        { agent: 'DEV', status: 'running' },
        { agent: 'QA', status: 'pending' }
      ],
      pendingGates: [],
      gateHistory: [],
      auditLog: [],
      qaResult: null,
      releaseStatus: 'pending',
      repoUrl: 'https://github.com/test/repo.git',
      featureRequest: 'add google login',
      isLoading: false,
      error: null,
      pollStatus: vi.fn(),
      startPipeline: vi.fn(),
      resolveGate: vi.fn(),
      releaseDecision: vi.fn(),
      setProjectId: vi.fn(),
      setError: vi.fn(),
    });

    render(
      <MemoryRouter>
        <SdlcDashboard />
      </MemoryRouter>
    );

    expect(screen.getByText('AIFA Execution Route')).toBeInTheDocument();
    expect(screen.getByText('ROUTE TYPE: BACKEND')).toBeInTheDocument();
    expect(screen.getByText('DEV RUNNING')).toBeInTheDocument();
  });

  it('calls pollStatus on mount when a workflow is active', async () => {
    const pollStatusSpy = vi.fn();
    mockUseSdlcStore.mockReturnValue({
      projectId: 'project-123',
      workflowId: 'project-123',
      status: 'po_running',
      routeType: 'FULLSTACK',
      pipelinePhases: [
        { agent: 'PO', status: 'running' },
        { agent: 'UX', status: 'pending' },
        { agent: 'DEV', status: 'pending' },
        { agent: 'QA', status: 'pending' }
      ],
      pendingGates: [],
      gateHistory: [],
      auditLog: [],
      qaResult: null,
      releaseStatus: 'pending',
      repoUrl: 'https://github.com/test/repo.git',
      featureRequest: 'add google login',
      isLoading: false,
      error: null,
      pollStatus: pollStatusSpy,
      startPipeline: vi.fn(),
      resolveGate: vi.fn(),
      releaseDecision: vi.fn(),
      setProjectId: vi.fn(),
      setError: vi.fn(),
    });

    render(
      <MemoryRouter>
        <SdlcDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(pollStatusSpy).toHaveBeenCalled();
    });
  });
});
