// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// Mock native modules before importing the controller.
const printToFileAsync = vi.fn();
const isAvailableAsync = vi.fn();
const shareAsync = vi.fn();

vi.mock('expo-print', () => ({
  printToFileAsync: (...args: unknown[]) => printToFileAsync(...args),
}));

vi.mock('expo-sharing', () => ({
  isAvailableAsync: (...args: unknown[]) => isAvailableAsync(...args),
  shareAsync: (...args: unknown[]) => shareAsync(...args),
}));

vi.mock('expo-file-system', () => {
  const existing = new Set<string>();
  class FakeFile {
    uri: string;
    constructor(...uris: unknown[]) {
      this.uri = uris
        .map((u) => (typeof u === 'string' ? u : String((u as { uri?: string }).uri ?? '')))
        .join('')
        .replace(/([^:]\/)\/+/g, '$1');
    }
    get exists() {
      return existing.has(this.uri);
    }
    get size() {
      return existing.has(this.uri) ? 1234 : null;
    }
    async move(dest: FakeFile) {
      existing.delete(this.uri);
      existing.add(dest.uri);
    }
    async copy(dest: FakeFile) {
      existing.add(dest.uri);
    }
    delete() {
      existing.delete(this.uri);
    }
    async bytes() {
      return new Uint8Array([1, 2, 3]);
    }
    write() {}
    create() {
      existing.add(this.uri);
    }
    get name() {
      return this.uri.split('/').pop() ?? this.uri;
    }
  }
  class FakeDirectory {
    uri: string;
    constructor(...uris: unknown[]) {
      this.uri = uris.join('');
    }
    list() {
      return [];
    }
    delete() {}
  }
  return {
    File: FakeFile,
    Directory: FakeDirectory,
    Paths: { cache: 'file:///cache/' },
    __existing: existing,
  };
});

const logMutation = vi.fn();
vi.mock('@/utils/logger', () => ({
  logMutation: (...args: unknown[]) => logMutation(...args),
}));

import {
  useReportExport,
  type ReportExportConfig,
} from '@/hooks/useReportExport';
import type { ReportDocument } from '@/utils/pdf/document';

type Params = { range: string };
type Data = { snapshotAt: string };

function makeDocument(label: string): ReportDocument {
  return {
    label,
    generatedAt: '2026-09-03T14:25:33',
    pages: [{ title: label, contextLine: 'ctx', bodyHtml: '<p>x</p>' }],
  };
}

function config(overrides?: Partial<ReportExportConfig<Params, Data>>): ReportExportConfig<Params, Data> {
  return {
    id: 'summary',
    shareTitle: 'Test raporu',
    fetch: async () => ({ snapshotAt: '2026-09-03T14:25:33' }),
    buildDocument: (data) => makeDocument(data.snapshotAt),
    fileName: (params, data) => `test-${params.range}-${data.snapshotAt}.pdf`,
    describe: (params) => params.range,
    ...overrides,
  };
}

describe('useReportExport', () => {
  beforeEach(() => {
    printToFileAsync.mockReset();
    isAvailableAsync.mockReset();
    shareAsync.mockReset();
    logMutation.mockReset();
    printToFileAsync.mockResolvedValue({ uri: 'file:///print/cache.pdf', numberOfPages: 1 });
    isAvailableAsync.mockResolvedValue(true);
    shareAsync.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('starts in idle with the panel closed', () => {
    const { result } = renderHook(() => useReportExport(config()));
    expect(result.current.state.status).toBe('idle');
    expect(result.current.isOpen).toBe(false);
    expect(result.current.isBusy).toBe(false);
  });

  it('runs fetch → render → ready and exposes metadata', async () => {
    const { result } = renderHook(() => useReportExport(config()));

    await act(async () => {
      await result.current.trigger({ range: 'week' });
    });

    expect(result.current.state.status).toBe('ready');
    expect(result.current.isOpen).toBe(true);
    if (result.current.state.status === 'ready') {
      expect(result.current.state.uri).toMatch(/\.pdf$/);
      expect(result.current.state.pageCount).toBe(1);
      expect(result.current.state.fileName).toContain('test-week');
      expect(result.current.state.contextLabel).toBe('week');
    }
    expect(logMutation).toHaveBeenCalledWith('generate_summary_pdf', 'start', expect.anything());
    expect(logMutation).toHaveBeenCalledWith('generate_summary_pdf', 'success', expect.anything());
  });

  it('surfaces fetch errors and does not print', async () => {
    const { result } = renderHook(() =>
      useReportExport(
        config({ fetch: async () => { throw new Error('fetch blew up'); } }),
      ),
    );

    await act(async () => {
      await result.current.trigger({ range: 'week' });
    });

    expect(result.current.state.status).toBe('error');
    if (result.current.state.status === 'error') {
      expect(result.current.state.message).toContain('fetch blew up');
    }
    expect(printToFileAsync).not.toHaveBeenCalled();
    expect(logMutation).toHaveBeenCalledWith('generate_summary_pdf', 'error', expect.anything());
  });

  it('surfaces render errors', async () => {
    printToFileAsync.mockRejectedValue(new Error('print unavailable'));
    const { result } = renderHook(() => useReportExport(config()));

    await act(async () => {
      await result.current.trigger({ range: 'week' });
    });

    expect(result.current.state.status).toBe('error');
  });

  it('discards stale operations (older completion cannot overwrite newer)', async () => {
    const resolvers: Array<(d: Data) => void> = [];
    const fetch = vi.fn(() => new Promise<Data>((resolve) => resolvers.push(resolve)));

    const { result } = renderHook(() => useReportExport(config({ fetch })));

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.trigger({ range: 'week' });
    });
    act(() => {
      second = result.current.trigger({ range: 'month' });
    });

    // Second (newer) completes first.
    await act(async () => {
      resolvers[1]!({ snapshotAt: '2026-09-03T15:00:00' });
      await second;
    });
    // First (stale) completes later and must be ignored.
    await act(async () => {
      resolvers[0]!({ snapshotAt: '2026-09-03T14:00:00' });
      await first;
    });

    if (result.current.state.status === 'ready') {
      expect(result.current.state.contextLabel).toBe('month');
    } else {
      throw new Error('expected ready state');
    }
  });

  it('retry replays the last params', async () => {
    const fetch = vi.fn(async () => ({ snapshotAt: '2026-09-03T14:25:33' }));
    const { result } = renderHook(() =>
      useReportExport(config({ fetch, buildDocument: () => makeDocument('x') })),
    );

    await act(async () => {
      await result.current.trigger({ range: 'week' });
    });
    expect(fetch).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.retry();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenLastCalledWith({ range: 'week' });
  });

  it('share() forwards the rendered uri', async () => {
    const { result } = renderHook(() => useReportExport(config()));

    await act(async () => {
      await result.current.trigger({ range: 'week' });
    });
    await act(async () => {
      await result.current.share();
    });

    expect(shareAsync).toHaveBeenCalledTimes(1);
    const uri = shareAsync.mock.calls[0]?.[0] as string;
    expect(uri).toMatch(/\.pdf$/);
  });

  it('share() is a no-op when not ready', async () => {
    const { result } = renderHook(() => useReportExport(config()));
    await act(async () => {
      await result.current.share();
    });
    expect(shareAsync).not.toHaveBeenCalled();
  });

  it('share() failure keeps the PDF ready and surfaces shareError', async () => {
    shareAsync.mockRejectedValue(new Error('share rejected'));
    const { result } = renderHook(() => useReportExport(config()));

    await act(async () => {
      await result.current.trigger({ range: 'week' });
    });
    await act(async () => {
      await result.current.share();
    });

    expect(result.current.state.status).toBe('ready');
    if (result.current.state.status === 'ready') {
      expect(result.current.state.shareError).toContain('share rejected');
      expect(result.current.state.shareBusy).toBe(false);
    }
    expect(logMutation).toHaveBeenCalledWith('share_summary_pdf', 'error', expect.anything());
  });

  it('reset returns to idle', async () => {
    const { result } = renderHook(() => useReportExport(config()));
    await act(async () => {
      await result.current.trigger({ range: 'week' });
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.state.status).toBe('idle');
  });
});
