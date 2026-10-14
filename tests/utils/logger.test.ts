import { afterEach, describe, expect, it, vi } from 'vitest';

import { instrumentQuery, logMutation, logQuery } from '@/utils/logger';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('logger timestamps', () => {
  it('shows Istanbul time and an explicit UTC+3 label for queries and mutations', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-31T21:15:04Z'));
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    logQuery('test', 'fetch');
    logMutation('test', 'success');
    logMutation('test', 'error', 'failed');
    expect(log.mock.calls[0][0]).toContain('01.01.2027 00:15:04 UTC+3');
    expect(log.mock.calls[1][0]).toContain('01.01.2027 00:15:04 UTC+3');
    expect(error.mock.calls[0][0]).toContain('01.01.2027 00:15:04 UTC+3');
  });

  it('preserves instrumented query results and errors', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await instrumentQuery('test', async () => [1])()).toEqual([1]);
    const failure = new Error('failed');
    await expect(instrumentQuery('test', async () => { throw failure; })()).rejects.toBe(failure);
  });
});
