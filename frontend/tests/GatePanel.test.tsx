import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import GatePanel from '@/pages/SdlcDashboard/components/GatePanel';
import { useSdlcStore } from '@/store/useSdlcStore';

// Mock the store
vi.mock('@/store/useSdlcStore', () => ({
  useSdlcStore: vi.fn(),
}));

// Mock the DiffViewer component to isolate GatePanel testing
vi.mock('@/pages/SdlcDashboard/components/DiffViewer', () => ({
  default: ({ diff, fileName }: any) => (
    <div data-testid="diff-viewer">
      <span>{fileName}</span>
      <span>{diff}</span>
    </div>
  ),
}));

describe('GatePanel Component', () => {
  const mockUseSdlcStore = useSdlcStore as unknown as Mock;
  const mockResolveGate = vi.fn();
  let alertMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  it('renders null when there is no active gate', () => {
    mockUseSdlcStore.mockReturnValue({
      pendingGates: [],
      resolveGate: mockResolveGate,
      isLoading: false,
    });

    const { container } = render(<GatePanel />);
    expect(container.firstChild).toBeNull();
  });

  describe('DEV_FILE_GATE (Security Gate)', () => {
    const mockDevGate = {
      id: 'gate-1',
      type: 'DEV_FILE_GATE',
      status: 'PENDING',
      payload: {
        path: 'src/auth/jwt.py',
        reason: 'auth/security file modification (High Risk Level)',
        diff: '--- old.py\n+++ new.py\n@@ -1,2 +1,2 @@\n-secret = 123\n+secret = 456',
      },
      createdAt: new Date().toISOString(),
    };

    beforeEach(() => {
      mockUseSdlcStore.mockReturnValue({
        pendingGates: [mockDevGate],
        resolveGate: mockResolveGate,
        isLoading: false,
      });
    });

    it('renders security governance header, badge and file path correctly', () => {
      render(<GatePanel />);
      expect(screen.getByText('Security Governance Gate')).toBeInTheDocument();
      expect(screen.getByText('DEV RISK GATE (A)')).toBeInTheDocument();
      expect(screen.getByText('RISK ASSESSMENT TRIGGERED')).toBeInTheDocument();
      expect(screen.getAllByText('src/auth/jwt.py')[0]).toBeInTheDocument();
      expect(screen.getByText(/auth\/security file modification/i)).toBeInTheDocument();
      expect(screen.getByTestId('diff-viewer')).toBeInTheDocument();
    });

    it('triggers resolveGate on approval', async () => {
      render(<GatePanel />);
      const approveBtn = screen.getByText('Approve Override');
      fireEvent.click(approveBtn);

      expect(mockResolveGate).toHaveBeenCalledWith('gate-1', 'approve', '');
    });

    it('shows alert when rejecting without review comments', () => {
      render(<GatePanel />);
      const rejectBtn = screen.getByText('Reject & Rerun');
      fireEvent.click(rejectBtn);

      expect(alertMock).toHaveBeenCalledWith('Please provide a comment explaining the rejection reason.');
      expect(mockResolveGate).not.toHaveBeenCalled();
    });

    it('triggers resolveGate on rejection with comments', async () => {
      render(<GatePanel />);
      const commentInput = screen.getByPlaceholderText(/Explain why you are approving/i);
      fireEvent.change(commentInput, { target: { value: 'This risk is accepted because of audit guidelines.' } });

      const rejectBtn = screen.getByText('Reject & Rerun');
      fireEvent.click(rejectBtn);

      expect(mockResolveGate).toHaveBeenCalledWith('gate-1', 'reject', 'This risk is accepted because of audit guidelines.');
    });
  });

  describe('PO_CLARIFY (Product Requirements Gate)', () => {
    const mockPoGate = {
      id: 'gate-2',
      type: 'PO_CLARIFY',
      status: 'PENDING',
      payload: {
        questions: [
          'What is the branding theme?',
          'Should we persist credentials?',
        ],
      },
      createdAt: new Date().toISOString(),
    };

    beforeEach(() => {
      mockUseSdlcStore.mockReturnValue({
        pendingGates: [mockPoGate],
        resolveGate: mockResolveGate,
        isLoading: false,
      });
    });

    it('renders product requirements header, badge and questions correctly', () => {
      render(<GatePanel />);
      expect(screen.getByText('Product Requirements Gate')).toBeInTheDocument();
      expect(screen.getByText('PO CLARIFY GATE (B)')).toBeInTheDocument();
      expect(screen.getByText('REQUIREMENTS CLARIFICATION')).toBeInTheDocument();
      expect(screen.getByText('Q1: What is the branding theme?')).toBeInTheDocument();
      expect(screen.getByText('Q2: Should we persist credentials?')).toBeInTheDocument();
    });

    it('allows option selection and submits choice answers with comments', async () => {
      render(<GatePanel />);

      // Let's find branding theme options. Branding matches `getMockQuestionOptions` rule for "branding" -> Standard Google branding vs custom dark.
      // Default should be chosen (Standard Google branding)
      const option2 = screen.getByText('Implement custom dark branding styling');
      fireEvent.click(option2);

      // Select option for Question 2
      const option2Q2 = screen.getByText('Persist auth state locally across sessions (Default)');
      fireEvent.click(option2Q2);

      const commentInput = screen.getByPlaceholderText(/Write custom requirements here/i);
      fireEvent.change(commentInput, { target: { value: 'User added note.' } });

      const submitBtn = screen.getByText('Submit Choices');
      fireEvent.click(submitBtn);

      // Verify final comment contains Q1 choice, default Q2 choice (persist auth state locally across sessions)
      expect(mockResolveGate).toHaveBeenCalledWith(
        'gate-2',
        'approve',
        expect.stringContaining('Q1: Implement custom dark branding styling')
      );
      expect(mockResolveGate).toHaveBeenCalledWith(
        'gate-2',
        'approve',
        expect.stringContaining('Q2: Persist auth state locally across sessions')
      );
      expect(mockResolveGate).toHaveBeenCalledWith(
        'gate-2',
        'approve',
        expect.stringContaining('User Notes: User added note.')
      );
    });

    it('cancels pipeline and triggers resolveGate with reject', async () => {
      render(<GatePanel />);
      const commentInput = screen.getByPlaceholderText(/Write custom requirements here/i);
      fireEvent.change(commentInput, { target: { value: 'Cancelling requirement grooming due to pivot.' } });

      const cancelBtn = screen.getByText('Cancel Pipeline');
      fireEvent.click(cancelBtn);

      expect(mockResolveGate).toHaveBeenCalledWith('gate-2', 'reject', 'Cancelling requirement grooming due to pivot.');
    });
  });
});
