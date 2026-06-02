import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { subscribeTaskSSE } from '@/services/api/sdlcApi';
import { getStoredAuthSession } from '@/services/api/authStorage';

vi.mock('@/services/api/authStorage', () => ({
  getStoredAuthSession: vi.fn(),
}));

vi.mock('@/services/api/client', () => ({
  default: {},
  getBaseURL: () => 'http://localhost:3000/api/v1/',
}));

describe('subscribeTaskSSE (SSE client)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should initiate fetch call with authorization header and signal', () => {
    const mockSession = { access_token: 'test-token-123' };
    (getStoredAuthSession as any).mockReturnValue(mockSession);

    const mockFetch = vi.fn().mockImplementation(() => new Promise(() => {}));
    globalThis.fetch = mockFetch;

    const handlers = {
      onProgress: vi.fn(),
      onCompleted: vi.fn(),
      onError: vi.fn(),
    };

    const abortController = subscribeTaskSSE('task-123', handlers);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/sdlc/status/task-123',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token-123',
        }),
        signal: abortController.signal,
      })
    );
  });

  it('should trigger onWarning warning timer if no events received in 60s', async () => {
    const mockFetch = vi.fn().mockImplementation(() => new Promise(() => {}));
    globalThis.fetch = mockFetch;

    const onWarning = vi.fn();
    subscribeTaskSSE('task-123', { onWarning });

    // Fast-forward time
    vi.advanceTimersByTime(65000);

    expect(onWarning).toHaveBeenCalledWith(
      'No progress events received in the last 60 seconds.'
    );
  });

  it('should abort cleanly when controller signal is aborted', () => {
    const mockFetch = vi.fn().mockImplementation(() => new Promise(() => {}));
    globalThis.fetch = mockFetch;

    const abortController = subscribeTaskSSE('task-123', {});
    expect(abortController.signal.aborted).toBe(false);

    abortController.abort();
    expect(abortController.signal.aborted).toBe(true);
  });
});
