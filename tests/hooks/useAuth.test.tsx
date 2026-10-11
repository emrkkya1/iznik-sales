// @vitest-environment happy-dom
import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const signIn = vi.fn();
const signOut = vi.fn();
const getCurrentUser = vi.fn();
const onAuthStateChange = vi.fn();
const logMutation = vi.fn();
const logQuery = vi.fn();

vi.mock('@/services', () => ({
  services: {
    auth: {
      getSession: () => getSession(), signIn: (...args: unknown[]) => signIn(...args),
      signOut: () => signOut(), onAuthStateChange: (cb: unknown) => onAuthStateChange(cb),
    },
    session: { getCurrentUser: () => getCurrentUser() },
  },
}));
vi.mock('@/utils/logger', () => ({
  logMutation: (...args: unknown[]) => logMutation(...args),
  logQuery: (...args: unknown[]) => logQuery(...args),
}));

import { useAuthStore } from '@/store';
import { useAuthBootstrap } from '@/hooks/useAuthBootstrap';
import { InactiveAccountError, useSignIn } from '@/hooks/useSignIn';
import { useSignOut } from '@/hooks/useSignOut';

const session = { accessToken: 'token', expiresAt: null, user: { id: 'user-1', email: 'staff@test' } };
const activeStaff = { id: 'user-1', fullName: 'Staff', username: 'staff', role: 'staff' as const, isActive: true };

function wrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('auth hooks', () => {
  beforeEach(() => {
    getSession.mockReset(); signIn.mockReset(); signOut.mockReset(); getCurrentUser.mockReset();
    onAuthStateChange.mockReset(); logMutation.mockReset(); logQuery.mockReset();
    useAuthStore.getState().reset();
    onAuthStateChange.mockReturnValue(() => undefined);
  });
  afterEach(() => useAuthStore.getState().reset());

  it('signs in an active user without logging the password', async () => {
    signIn.mockResolvedValue(session); getCurrentUser.mockResolvedValue(activeStaff);
    const { result } = renderHook(() => useSignIn(), { wrapper });
    await act(async () => { await result.current.mutateAsync({ email: ' staff@test ', password: 'secret' }); });
    expect(useAuthStore.getState()).toMatchObject({ session, user: activeStaff });
    expect(logMutation).toHaveBeenCalledWith('signIn', 'start', { email: ' staff@test ' });
    expect(JSON.stringify(logMutation.mock.calls)).not.toContain('secret');
  });

  it('clears an inactive session and rejects the sign-in', async () => {
    signIn.mockResolvedValue(session); signOut.mockResolvedValue(undefined);
    getCurrentUser.mockResolvedValue({ ...activeStaff, isActive: false });
    const { result } = renderHook(() => useSignIn(), { wrapper });
    await act(async () => { await expect(result.current.mutateAsync({ email: 'staff@test', password: 'secret' })).rejects.toBeInstanceOf(InactiveAccountError); });
    expect(signOut).toHaveBeenCalledOnce();
    expect(useAuthStore.getState().session).toBeNull();
    expect(logMutation).toHaveBeenCalledWith('signIn', 'error', expect.any(InactiveAccountError));
  });

  it('restores an active session and resets when profile lookup fails', async () => {
    getSession.mockResolvedValue(session); getCurrentUser.mockResolvedValue(activeStaff);
    const restored = renderHook(() => useAuthBootstrap());
    await waitFor(() => expect(restored.result.current.isRestoring).toBe(false));
    expect(useAuthStore.getState()).toMatchObject({ session, user: activeStaff });
    restored.unmount();

    useAuthStore.getState().reset();
    getSession.mockResolvedValue(session); getCurrentUser.mockRejectedValue(new Error('expired'));
    const failed = renderHook(() => useAuthBootstrap());
    await waitFor(() => expect(failed.result.current.isRestoring).toBe(false));
    expect(signOut).toHaveBeenCalled();
    expect(useAuthStore.getState().session).toBeNull();
    expect(logQuery).toHaveBeenCalledWith('auth_bootstrap_get_user', 'error', expect.any(Error));
  });

  it('clears query cache and auth state only after successful sign-out', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const clear = vi.spyOn(client, 'clear');
    signOut.mockResolvedValue(undefined);
    useAuthStore.getState().setSession(session); useAuthStore.getState().setUser(activeStaff);
    const localWrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useSignOut(), { wrapper: localWrapper });
    await act(async () => { await result.current.mutateAsync(); });
    expect(clear).toHaveBeenCalledOnce();
    expect(useAuthStore.getState().user).toBeNull();
  });
});
