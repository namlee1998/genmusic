import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import '@/i18n';
import App from '@/App';
import { useAuthStore } from '@/store/useAuthStore';

vi.mock('@/store/useAuthStore', () => ({
  useAuthStore: vi.fn(),
}));

describe('App 404 routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, '', '/missing-route');
    (useAuthStore as unknown as Mock).mockReturnValue({
      session: null,
      isInitialized: true,
      initializeAuth: vi.fn(),
    });
  });

  it('renders the not found page for unmatched public routes', async () => {
    render(<App />);

    expect(await screen.findByText('404 - Page not found', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText('This route is off the map')).toBeInTheDocument();
  });
});

