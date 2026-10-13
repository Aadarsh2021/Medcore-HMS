import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, ApiError, getApiBaseUrl } from '../lib/api/client';
import { useAuthStore } from '../stores/authStore';

// Mock Supabase browser client
const mockGetSession = vi.fn();
const mockRefreshSession = vi.fn();

vi.mock('../lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: mockGetSession,
      refreshSession: mockRefreshSession,
    },
  }),
}));

describe('MedCore HMS — Centralized API Client & Authentication Suite', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: null, session: null, isInitialized: false });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('1. should resolve configured API base URL without trailing slash', () => {
    const url = getApiBaseUrl();
    expect(url).toBeDefined();
    expect(url.endsWith('/')).toBe(false);
  });

  it('2. should attach Bearer token from active Zustand session', async () => {
    useAuthStore.setState({
      session: { access_token: 'active-session-jwt-123' },
    });

    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ success: true, data: { items: [] } }),
    } as any);

    await apiClient('/appointments');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, fetchOpts] = (global.fetch as any).mock.calls[0];
    const headers = fetchOpts.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer active-session-jwt-123');
  });

  it('3. should proactively retrieve session from Supabase browser client if store is uninitialized', async () => {
    // Zustand store has no token
    useAuthStore.setState({ session: null });

    // Supabase browser storage has a valid session
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'retrieved-from-storage-jwt' } },
    });

    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ success: true, data: [] }),
    } as any);

    await apiClient('/appointments');

    expect(mockGetSession).toHaveBeenCalled();
    const [, fetchOpts] = (global.fetch as any).mock.calls[0];
    const headers = fetchOpts.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer retrieved-from-storage-jwt');
  });

  it('4. should automatically refresh token and retry request once upon receiving 401 Unauthorized', async () => {
    useAuthStore.setState({
      session: { access_token: 'expired-jwt-token' },
    });

    // Supabase refreshSession returns a fresh token
    mockRefreshSession.mockResolvedValue({
      data: { session: { access_token: 'freshly-refreshed-jwt' } },
      error: null,
    });

    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async (_url, opts) => {
      callCount++;
      const authHeader = (opts.headers as Headers).get('Authorization');
      if (callCount === 1) {
        // First call fails with 401
        expect(authHeader).toBe('Bearer expired-jwt-token');
        return {
          status: 401,
          ok: false,
          json: async () => ({ message: 'Invalid or expired authentication session' }),
        };
      }
      // Second retry call succeeds with refreshed token
      expect(authHeader).toBe('Bearer freshly-refreshed-jwt');
      return {
        status: 200,
        ok: true,
        json: async () => ({ success: true, data: [{ id: 'apt-1' }] }),
      };
    });

    const res = await apiClient('/appointments');

    expect(callCount).toBe(2);
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    expect(res.data).toEqual([{ id: 'apt-1' }]);
  });

  it('5. should fail with ApiError(401) without infinite loop if refresh also fails', async () => {
    useAuthStore.setState({
      session: { access_token: 'completely-dead-jwt' },
    });

    mockRefreshSession.mockResolvedValue({
      data: { session: null },
      error: new Error('Refresh token revoked'),
    });

    global.fetch = vi.fn().mockResolvedValue({
      status: 401,
      ok: false,
      json: async () => ({ message: 'Unauthorized session' }),
    } as any);

    await expect(apiClient('/appointments')).rejects.toThrow(ApiError);
    // Fetch should only have been called once because refresh failed
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('6. should attach X-Hospital-Id override header for SUPER_ADMIN role', async () => {
    useAuthStore.setState({
      user: {
        id: 'super-user-1',
        email: 'super@medcore.org',
        role: 'SUPER_ADMIN' as any,
        hospitalId: 'target-hospital-uuid-999',
        firstName: 'Super',
        lastName: 'Admin',
      },
      session: { access_token: 'super-token' },
    });

    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ success: true }),
    } as any);

    await apiClient('/billing/invoices');

    const [, fetchOpts] = (global.fetch as any).mock.calls[0];
    const headers = fetchOpts.headers as Headers;
    expect(headers.get('X-Hospital-Id')).toBe('target-hospital-uuid-999');
  });
});
