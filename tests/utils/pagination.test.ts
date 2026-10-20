import { describe, expect, it, vi } from 'vitest';
import { loadNextPageIfIdle } from '@/utils/pagination';
import { InfiniteQueryObserver, QueryClient } from '@tanstack/react-query';

describe('loadNextPageIfIdle', () => {
  it('does not interrupt an active refresh or fetch past the last page', () => {
    const fetchNextPage = vi.fn().mockResolvedValue(undefined);
    loadNextPageIfIdle({ hasNextPage: true, isFetching: true, fetchNextPage });
    loadNextPageIfIdle({ hasNextPage: false, isFetching: false, fetchNextPage });
    expect(fetchNextPage).not.toHaveBeenCalled();
  });
  it('protects against duplicate events even before the observer rerenders', () => {
    const fetchNextPage = vi.fn().mockResolvedValue(undefined);
    const query = { hasNextPage: true, isFetching: false, fetchNextPage };
    loadNextPageIfIdle(query);
    loadNextPageIfIdle(query);
    expect(fetchNextPage.mock.calls).toEqual([[{ cancelRefetch: false }], [{ cancelRefetch: false }]]);
  });
  it('coalesces duplicate page events into one actual request', async () => {
    const client = new QueryClient();
    let resolveNext!: (value: string[]) => void;
    const next = new Promise<string[]>(resolve => { resolveNext = resolve; });
    const queryFn = vi.fn().mockResolvedValueOnce(['first']).mockReturnValue(next);
    const observer = new InfiniteQueryObserver(client, {
      queryKey: ['pagination-test'], queryFn, initialPageParam: 0,
      getNextPageParam: (_last: string[], pages: string[][]) => pages.length,
    });
    const unsubscribe = observer.subscribe(() => undefined);
    try {
      await observer.refetch();
      const staleSnapshot = observer.getCurrentResult();
      loadNextPageIfIdle(staleSnapshot);
      loadNextPageIfIdle(staleSnapshot);
      const completion = observer.fetchNextPage({ cancelRefetch: false });
      resolveNext(['second']);
      await completion;
      expect(queryFn).toHaveBeenCalledTimes(2);
      expect(observer.getCurrentResult().data?.pages).toEqual([['first'], ['second']]);
    } finally { unsubscribe(); client.clear(); }
  });
});
