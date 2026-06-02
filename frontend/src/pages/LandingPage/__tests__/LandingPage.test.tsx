import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { LandingPage } from '../index';
import { useAuthStore } from '@/store/useAuthStore';

// Mock intersection observer for framer-motion
beforeAll(() => {
  setupIntersectionObserverMock();
});

function setupIntersectionObserverMock() {
  const intersectionObserverMock = () => ({
    observe: () => null,
    unobserve: () => null,
    disconnect: () => null,
  });
  window.IntersectionObserver = vi.fn().mockImplementation(intersectionObserverMock);
}

// Mock the navigate function
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock the auth store
vi.mock('@/store/useAuthStore', () => ({
  useAuthStore: vi.fn(),
}));

describe('LandingPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
    (useAuthStore as unknown as Mock).mockReturnValue({ session: null });
  });

  it('renders the landing page correctly', () => {
    render(
      <BrowserRouter>
        <LandingPage />
      </BrowserRouter>
    );
    expect(screen.getByText(/End-to-End Autonomous/i)).toBeInTheDocument();
    expect(screen.getByText(/Deploy Your First Agent/i)).toBeInTheDocument();
  });

  it('navigates to /auth when "Deploy Your First Agent" is clicked and user is not authenticated', () => {
    render(
      <BrowserRouter>
        <LandingPage />
      </BrowserRouter>
    );
    const startButton = screen.getByText(/Deploy Your First Agent/i);
    fireEvent.click(startButton);
    expect(mockNavigate).toHaveBeenCalledWith('/auth');
  });

  it('navigates to /sdlc when "Deploy Your First Agent" is clicked and user is authenticated', () => {
    (useAuthStore as unknown as Mock).mockReturnValue({ session: { user: { id: '1' } } });
    render(
      <BrowserRouter>
        <LandingPage />
      </BrowserRouter>
    );
    const startButton = screen.getByText(/Deploy Your First Agent/i);
    fireEvent.click(startButton);
    expect(mockNavigate).toHaveBeenCalledWith('/sdlc');
  });

  it('navigates to /auth when "Sign In" is clicked in navbar', () => {
    render(
      <BrowserRouter>
        <LandingPage />
      </BrowserRouter>
    );
    const signInButton = screen.getAllByText(/Sign In/i)[0]; // First one is in Navbar
    fireEvent.click(signInButton);
    expect(mockNavigate).toHaveBeenCalledWith('/auth');
  });
});

