import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import AgentTaskBoard from '@/pages/SdlcDashboard/components/AgentTaskBoard';
import { useSdlcStore } from '@/store/useSdlcStore';

vi.mock('@/store/useSdlcStore', () => ({
  useSdlcStore: vi.fn(),
}));

describe('AgentTaskBoard Component', () => {
  const mockUseSdlcStore = useSdlcStore as unknown as Mock;
  const mockSetActiveDetailType = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSdlcStore.mockReturnValue({
      pipelinePhases: [
        { agent: 'PO', status: 'completed', duration: '2m 15s' },
        { agent: 'UX', status: 'skipped' },
        { agent: 'DEV', status: 'running', duration: '1m 5s' },
        { agent: 'QA', status: 'pending' }
      ],
      routeType: 'FULLSTACK',
      status: 'dev_running'
    });
  });

  it('renders route type and status badge', () => {
    render(<AgentTaskBoard setActiveDetailType={mockSetActiveDetailType} />);
    expect(screen.getByText('AIFA Execution Route')).toBeInTheDocument();
    expect(screen.getByText('ROUTE TYPE: FULLSTACK')).toBeInTheDocument();
    expect(screen.getByText('DEV RUNNING')).toBeInTheDocument();
  });

  it('renders all four agent columns', () => {
    render(<AgentTaskBoard setActiveDetailType={mockSetActiveDetailType} />);
    expect(screen.getByText('Product Owner (PO)')).toBeInTheDocument();
    expect(screen.getByText('UI/UX Designer (UX)')).toBeInTheDocument();
    expect(screen.getByText('Developer (DEV)')).toBeInTheDocument();
    expect(screen.getByText('Quality Assurance (QA)')).toBeInTheDocument();
  });

  it('displays correct phase badges for each column', () => {
    render(<AgentTaskBoard setActiveDetailType={mockSetActiveDetailType} />);
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
    expect(screen.getByText('SKIPPED')).toBeInTheDocument();
    expect(screen.getByText('RUNNING')).toBeInTheDocument();
    expect(screen.getByText('PENDING')).toBeInTheDocument();
  });

  it('shows duration for running and completed phases', () => {
    render(<AgentTaskBoard setActiveDetailType={mockSetActiveDetailType} />);
    expect(screen.getByText('2m 15s')).toBeInTheDocument();
    expect(screen.getByText('1m 5s')).toBeInTheDocument();
  });

  it('renders correct tasks and descriptions', () => {
    render(<AgentTaskBoard setActiveDetailType={mockSetActiveDetailType} />);
    expect(screen.getByText('Requirement Classification')).toBeInTheDocument();
    expect(screen.getByText('User Flow Design')).toBeInTheDocument();
    expect(screen.getByText('Implementation Plan')).toBeInTheDocument();
    expect(screen.getByText('Test Cases Execution')).toBeInTheDocument();
  });

  it('opens artifact detail modal when clicking completed artifact task card', () => {
    render(<AgentTaskBoard setActiveDetailType={mockSetActiveDetailType} />);
    
    // PO task 2 (PRD Generation) is in a completed phase, so it should be clickable
    const prdCard = screen.getByText('PRD Generation').closest('div');
    expect(prdCard).toBeInTheDocument();
    
    if (prdCard) {
      fireEvent.click(prdCard);
      expect(mockSetActiveDetailType).toHaveBeenCalledWith('prd');
    }
  });
});
