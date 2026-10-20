import { afterEach, describe, expect, it, vi } from 'vitest';

import { instrumentQuery, logMutation, logQuery } from '@/utils/logger';
import { clearDiagnosticEvents, getDiagnosticEvents } from '@/utils/diagnostics';

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

  it('correlates overlapping attempts independently and records elapsed time', async () => {
    clearDiagnosticEvents();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let finish!: (value: number) => void;
    const first = instrumentQuery('test', () => new Promise<number>(resolve => { finish = resolve; }))();
    await instrumentQuery('test', async () => 2)();
    finish(1);
    await first;
    const events = getDiagnosticEvents();
    expect(events.map(event => event.phase)).toEqual(['start', 'start', 'success', 'success']);
    expect(events[0].operationId).toBe(events[3].operationId);
    expect(events[1].operationId).toBe(events[2].operationId);
    expect(events[0].operationId).not.toBe(events[1].operationId);
    expect(events[3].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('distinguishes cancellation without swallowing errors or retaining their content', async () => {
    clearDiagnosticEvents();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const controller = new AbortController();
    controller.abort();
    const failure = new Error('private server response');
    await expect(instrumentQuery('test', async (_ctx: { signal: AbortSignal }) => { throw failure; })({ signal: controller.signal })).rejects.toBe(failure);
    expect(getDiagnosticEvents()[1].phase).toBe('cancelled');
    expect(JSON.stringify(getDiagnosticEvents())).not.toContain('private');
  });

  it('does not reject a successful query when its summarizer throws', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    expect(await instrumentQuery('test', async () => [1], () => { throw new Error('summary'); })()).toEqual([1]);
  });
});
