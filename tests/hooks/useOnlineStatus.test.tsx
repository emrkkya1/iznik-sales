// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let listener: ((state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => void) | undefined;
const unsubscribe = vi.fn();
vi.mock('@react-native-community/netinfo', () => ({ default: { addEventListener: (cb: typeof listener) => { listener = cb; return unsubscribe; } } }));

import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useConnectivityStore } from '@/store/connectivity';

describe('useOnlineStatus', () => {
  afterEach(() => { listener = undefined; unsubscribe.mockReset(); useConnectivityStore.getState().setOnline(true); });
  it('treats only explicit disconnected or unreachable states as offline and unsubscribes', () => {
    const hook = renderHook(() => useOnlineStatus());
    act(() => listener?.({ isConnected: null, isInternetReachable: null }));
    expect(useConnectivityStore.getState().isOnline).toBe(true);
    act(() => listener?.({ isConnected: true, isInternetReachable: false }));
    expect(useConnectivityStore.getState().isOnline).toBe(false);
    hook.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
