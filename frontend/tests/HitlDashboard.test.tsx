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
    expect(screen.getByText(/Centralized overview of pending security gates/i)).toBeInTheDocument();
  });

  it('renders metric cards with correct counts', () => {
    render(
      <MemoryRouter>
        <HitlDashboard />
      </MemoryRouter>
    );
    expect(screen.getByText('Total Pending')).toBeInTheDocument();
    expect(screen.getAllByText('Security Risks').length).toBeGreaterThan(0);
    expect(screen.getAllByText('PO Questions').length).toBeGreaterThan(0);
    
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
    expect(screen.getByText('https://github.com/aifa-workspace/payment-service-api')).toBeInTheDocument();
    expect(screen.getByText('https://github.com/aifa-workspace/auth-middleware-server')).toBeInTheDocument();
  });

  it('navigates to resolve when clicking the card action button', () => {
    render(
      <MemoryRouter>
        <HitlDashboard />
      </MemoryRouter>
    );
    
    const resolveButtons = screen.getAllByText('Navigate to Resolve');
    expect(resolveButtons.length).toBe(2);

    fireEvent.click(resolveButtons[0]);

    // Check cleanup store triggers
    expect(mockResetState).toHaveBeenCalledTimes(1);
    // Check project selection triggers
    expect(mockSetCurrentProject).toHaveBeenCalledWith('proj-pay-001');
    // Check routing path matching
    expect(mockNavigate).toHaveBeenCalledWith('/sdlc?highlightGate=gate-po-clarify-mock');
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
    expect(screen.getByText(/Your AI Agents are executing pipelines seamlessly/i)).toBeInTheDocument();
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

    const skeletons = container.querySelectorAll('.hitl-card--skeleton');
    expect(skeletons.length).toBe(3);
  });
});
