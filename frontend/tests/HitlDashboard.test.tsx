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

const mockSession = {
  sessionId: 'session-1',
  featureRequest: 'add google login',
  status: 'dev_running',
  pipelinePhases: [
    { agent: 'PO', status: 'completed' },
    { agent: 'UX', status: 'skipped' },
    { agent: 'DEV', status: 'running' },
    { agent: 'QA', status: 'pending' },
  ],
  routeType: 'FULLSTACK',
  repoUrl: 'https://github.com/test/repo',
  releaseStatus: 'pending',
  qaResult: null,
  auditLog: [],
  pendingGates: [],
  gateHistory: [],
  error: null,
};

const mockAppState = {
  currentProjectId: 'project-123',
};

describe('HitlDashboard Component', () => {
  const mockUseHitlStore = useHitlStore as unknown as Mock;
  const mockUseAppStore = useAppStore as unknown as Mock;
  const mockUseSdlcStore = useSdlcStore as unknown as Mock;

  const mockFetchInterventions = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseHitlStore.mockReturnValue({
      interventions: [],
      isLoading: false,
      error: null,
      fetchInterventions: mockFetchInterventions,
      lastFetchedAt: null,
    });

    mockUseAppStore.mockImplementation((selector) =>
      selector ? selector(mockAppState) : mockAppState
    );

    mockUseSdlcStore.mockImplementation((selector) =>
      selector ? selector({ getAllSessions: () => [] }) : { getAllSessions: () => [] }
    );
  });

  it('renders the core dashboard header with session count', () => {
    render(
      <MemoryRouter>
        <HitlDashboard />
      </MemoryRouter>
    );
    expect(screen.getByText('AIFA Dashboard')).toBeInTheDocument();
    expect(screen.getByText(/0 active sessions/i)).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('shows empty state when there are no active sessions', () => {
    render(
      <MemoryRouter>
        <HitlDashboard />
      </MemoryRouter>
    );
    expect(screen.getByText('No active sessions')).toBeInTheDocument();
    expect(screen.getByText(/Start a feature request/i)).toBeInTheDocument();
  });

  it('renders session blocks when sessions exist', () => {
    mockUseSdlcStore.mockImplementation((selector) =>
      selector ? selector({ getAllSessions: () => [mockSession] }) : { getAllSessions: () => [mockSession] }
    );

    render(
      <MemoryRouter>
        <HitlDashboard />
      </MemoryRouter>
    );

    expect(screen.getByText(/1 active session/i)).toBeInTheDocument();
    expect(screen.getByText(/Session 1 — add google login/i)).toBeInTheDocument();
    expect(screen.getByText(/Manage Agents/)).toBeInTheDocument();
    expect(screen.queryByText('No active sessions')).not.toBeInTheDocument();
  });

  it('renders error banner and retry button when error is present', () => {
    mockUseHitlStore.mockReturnValue({
      interventions: [],
      isLoading: false,
      error: 'Failed to load interventions',
      fetchInterventions: mockFetchInterventions,
      lastFetchedAt: null,
    });

    render(
      <MemoryRouter>
        <HitlDashboard />
      </MemoryRouter>
    );

    expect(screen.getByText('Failed to load interventions')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('shows spinning icon on refresh button when loading', () => {
    mockUseHitlStore.mockReturnValue({
      interventions: [],
      isLoading: true,
      error: null,
      fetchInterventions: mockFetchInterventions,
      lastFetchedAt: null,
    });

    render(
      <MemoryRouter>
        <HitlDashboard />
      </MemoryRouter>
    );

    // Refresh icon should have animate-spin class when isLoading
    const refreshBtn = screen.getByText(/Last updated/i).closest('button');
    expect(refreshBtn).not.toBeNull();
    expect(refreshBtn!.querySelector('.animate-spin')).toBeTruthy();
  });
});
