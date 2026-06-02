import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
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
  getWorkflowStatus: vi.fn(),
  getAuditTrail: vi.fn(),
  getFinalReviewPacket: vi.fn(),
  subscribeTaskSSE: vi.fn(),
  getBacklogs: vi.fn(),
  moveBacklog: vi.fn(),
  createBacklog: vi.fn(),
  submitGateDecision: vi.fn(),
  releaseToProduction: vi.fn(),
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
      workflowStatus: {
        projectId: 'project-123',
        currentPhase: 'po-agent',
        phases: {
          intent: null,
          po: null,
          ux: null,
          dev: null,
          qa: null,
        },
      },
      workflowLoading: false,
      activePhase: null,
      sseLogs: [],
      sseActive: false,
      artifacts: [],
      selectedArtifact: null,
      auditEvents: [],
      isFeatureRequestFormOpen: false,
      isAuditSidebarOpen: false,
      setProjectId: vi.fn(),
      setWorkflowStatus: vi.fn(),
      setWorkflowLoading: vi.fn(),
      setActiveTask: vi.fn(),
      appendSseLog: vi.fn(),
      setSseActive: vi.fn(),
      setArtifacts: vi.fn(),
      selectArtifact: vi.fn(),
      setAuditEvents: vi.fn(),
      setError: vi.fn(),
      setFeatureRequestFormOpen: vi.fn(),
      setAuditSidebarOpen: vi.fn(),
    });

    (sdlcApi.getWorkflowStatus as Mock).mockResolvedValue({
      projectId: 'project-123',
      currentPhase: 'po-agent',
      phases: {
        intent: null,
        po: null,
        ux: null,
        dev: null,
        qa: null,
      },
    });

    (sdlcApi.getAuditTrail as Mock).mockResolvedValue({
      events: [],
    });

    (sdlcApi.getBacklogs as Mock).mockResolvedValue([]);
  });


  it('renders empty state when no projectId is selected', () => {
    mockUseAppStore.mockReturnValue({
      currentProjectId: null,
      treeLoaded: true,
      fetchTree: vi.fn(),
    });
    mockUseSdlcStore.mockReturnValue({
      projectId: null,
      setProjectId: vi.fn(),
    });

    render(<SdlcDashboard />);
    expect(screen.getByText('Welcome to Autonomous Factory')).toBeInTheDocument();
  });

  it('renders tab switchers when a project is selected', async () => {
    render(<SdlcDashboard />);

    expect(screen.getByText('📋 Backlog Board')).toBeInTheDocument();
    expect(screen.getByText('⚙️ Pipeline Inspector')).toBeInTheDocument();
    expect(screen.getByText('📦 Final Release Packet')).toBeInTheDocument();
  });

  it('allows switching views', () => {
    render(<SdlcDashboard />);

    const pipelineBtn = screen.getByText('⚙️ Pipeline Inspector');
    fireEvent.click(pipelineBtn);

    // After switching to Pipeline view, pipeline content should be visible
    expect(pipelineBtn).toHaveClass('bg-primary');
  });

  it('calls getWorkflowStatus and getAuditTrail on mount', async () => {
    render(<SdlcDashboard />);

    await waitFor(() => {
      expect(sdlcApi.getWorkflowStatus).toHaveBeenCalledWith('project-123');
      expect(sdlcApi.getAuditTrail).toHaveBeenCalledWith('project-123');
    });
  });
});
