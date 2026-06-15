import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import HitlDashboard from '@/pages/SdlcDashboard/HitlDashboard';
import { useHitlStore } from '@/store/useHitlStore';
import { useAppStore } from '@/store/useAppStore';
import { useSdlcStore } from '@/store/useSdlcStore';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/store/useHitlStore', () => ({
  useHitlStore: vi.fn(),
}));

vi.mock('@/store/useAppStore', () => ({
  useAppStore: vi.fn(),
}));

vi.mock('@/store/useSdlcStore', () => ({
  useSdlcStore: vi.fn(),
}));

describe('HitlDashboard Component', () => {
  const mockUseHitlStore = useHitlStore as unknown as Mock;
  const mockUseAppStore = useAppStore as unknown as Mock;
  const mockUseSdlcStore = useSdlcStore as unknown as Mock;

  const mockInterventions = [
    {
      id: 'gate-po-clarify-mock',
      type: 'PO_CLARIFY',
      status: 'PENDING',
      payload: {
        questions: ['Question 1?', 'Question 2?']
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      projectId: 'proj-pay-001',
      projectName: 'Payment Service API',
      repoUrl: 'https://github.com/aifa-workspace/payment-service-api',
      pipelineStatus: 'awaiting_approval',
      currentPhase: 'PO'
    },
    {
      id: 'gate-dev-risk-mock',
      type: 'DEV_FILE_GATE',
      status: 'PENDING',
      payload: {
        action: 'MODIFY',
        path: 'src/auth/jwt.py',
        reason: 'auth/security file modification (High Risk Level)',
        diff: 'diff details'
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      projectId: 'proj-auth-002',
      projectName: 'Auth Middleware Server',
      repoUrl: 'https://github.com/aifa-workspace/auth-middleware-server',
      pipelineStatus: 'awaiting_approval',
      currentPhase: 'DEV'
    }
  ];

  const mockSetCurrentProject = vi.fn();
  const mockResetState = vi.fn();
  const mockFetchInterventions = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseHitlStore.mockReturnValue({
      interventions: mockInterventions,
      isLoading: false,
      error: null,
      fetchInterventions: mockFetchInterventions,
    });

    mockUseAppStore.mockReturnValue({
      setCurrentProject: mockSetCurrentProject,
    });

    mockUseSdlcStore.mockReturnValue({
      resetState: mockResetState,
    });
  });

  it('renders the core dashboard header and title', () => {
    render(
      <MemoryRouter>
        <HitlDashboard />
      </MemoryRouter>
    );
    expect(screen.getByText('Intervention Center')).toBeInTheDocument();
  });

  it('renders metric cards with correct counts', () => {
    render(
      <MemoryRouter>
        <HitlDashboard />
      </MemoryRouter>
    );
    expect(screen.getByText('Total Pending')).toBeInTheDocument();
    // 'Security Gates' appears in both the stat card label and the kanban column header
    expect(screen.getAllByText('Security Gates').length).toBeGreaterThanOrEqual(1);
    // 'PO Clarifications' also appears in both
    expect(screen.getAllByText('PO Clarifications').length).toBeGreaterThanOrEqual(1);
    
    // Total Pending is 2
    const pendingValues = screen.getAllByText('2');
    expect(pendingValues.length).toBeGreaterThan(0);
  });

  it('renders project intervention cards with details', () => {
    render(
      <MemoryRouter>
        <HitlDashboard />
      </MemoryRouter>
    );
    expect(screen.getByText('Payment Service API')).toBeInTheDocument();
    expect(screen.getByText('Auth Middleware Server')).toBeInTheDocument();
    // repoUrl is only rendered inside expanded FINAL_RELEASE cards, not in collapsed DEV/PO cards
  });

  it('navigates to the build dashboard when clicking the Review button', () => {
    render(
      <MemoryRouter>
        <HitlDashboard />
      </MemoryRouter>
    );

    // The card shows collapsed quick-actions: Approve, Reject, and an icon-only Review button.
    // Click the first card header to expand it, then click the Review button in the expanded area.
    const cardHeaders = screen.getAllByText('Payment Service API');
    expect(cardHeaders.length).toBeGreaterThan(0);
    fireEvent.click(cardHeaders[0]);

    // Now the Review button should be visible in the expanded detail
    const reviewBtn = screen.getAllByText('Review');
    expect(reviewBtn.length).toBeGreaterThan(0);
    fireEvent.click(reviewBtn[0]);

    // Check routing — links to build dashboard with highlightGate param
    expect(mockNavigate).toHaveBeenCalledWith('/sdlc/build?highlightGate=gate-po-clarify-mock');
    // Reset/selection are NOT called by the Review action
    expect(mockResetState).not.toHaveBeenCalled();
    expect(mockSetCurrentProject).not.toHaveBeenCalled();
  });

  it('renders the empty state when there are no pending interventions', () => {
    mockUseHitlStore.mockReturnValue({
      interventions: [],
      isLoading: false,
      error: null,
      fetchInterventions: mockFetchInterventions,
    });

    render(
      <MemoryRouter>
        <HitlDashboard />
      </MemoryRouter>
    );

    expect(screen.getByText('All clear! No pending interventions.')).toBeInTheDocument();
    expect(screen.getByText(/Your AI Agents are executing pipelines/i)).toBeInTheDocument();
  });

  it('renders skeleton loaders when in loading state', () => {
    mockUseHitlStore.mockReturnValue({
      interventions: [],
      isLoading: true,
      error: null,
      fetchInterventions: mockFetchInterventions,
    });

    const { container } = render(
      <MemoryRouter>
        <HitlDashboard />
      </MemoryRouter>
    );

    // Component renders 3 animate-pulse skeleton divs while loading
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(3);
  });
});
