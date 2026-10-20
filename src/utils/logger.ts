// Lightweight console logging for following app activity in the terminal
// (Metro / `expo run:android` output).
import { formatDateTime } from './dates';
import { recordDiagnosticEvent, startDiagnosticOperation } from './diagnostics';

type MutationPhase = 'start' | 'success' | 'error';

const MUTATION_PHASE_LABEL: Record<MutationPhase, string> = {
  start: '▶ START',
  success: '✔ SUCCESS',
  error: '✘ ERROR',
};

export function logMutation(
  name: string,
  phase: MutationPhase,
  data?: unknown,
): void {
  // Mutation hooks currently log phases separately and do not expose a shared
  // attempt identity. Do not correlate by name: same-name writes can overlap.
  recordDiagnosticEvent({ operationId: startDiagnosticOperation(), name, kind: 'mutation', phase, timestamp: Date.now() });
  const header = `[mutation:${name}] ${MUTATION_PHASE_LABEL[phase]} ${formatDateTime(new Date().toISOString())} UTC+3`;
  if (phase === 'error') console.error(header, data);
  else console.log(header, data);
}

type QueryPhase = 'fetch' | 'success' | 'error';

const QUERY_PHASE_LABEL: Record<QueryPhase, string> = {
  fetch: '◀ FETCH',
  success: '✔ SUCCESS',
  error: '✘ ERROR',
};

// Queries use a 'fetch' phase instead of 'start' to distinguish from
// mutation lifecycle. RPC names are snake_case to match the server.
export function logQuery(
  name: string,
  phase: QueryPhase,
  data?: unknown,
): void {
  const header = `[query:${name}] ${QUERY_PHASE_LABEL[phase]} ${formatDateTime(new Date().toISOString())} UTC+3`;
  if (phase === 'error') console.error(header, data);
  else console.log(header, data);
}

// Wraps a queryFn so every fetch logs fetch/success/error with a bounded
// payload. Use this from React Query hooks to get consistent terminal
// diagnostics without each hook having to repeat the try/catch dance.
//
// The generic preserves the queryFn's full signature, so the same helper
// covers `useQuery` (no args), `useInfiniteQuery` (with `{ pageParam }`),
// and any other arity — the wrapper forwards every argument unchanged.
export function instrumentQuery<TFn extends (...args: any[]) => Promise<any>>(
  name: string,
  fn: TFn,
  summarize?: (result: Awaited<ReturnType<TFn>>) => unknown,
): TFn {
  return (async (...args: Parameters<TFn>) => {
    const ctx = args[0] as { pageParam?: unknown; signal?: AbortSignal } | undefined;
    const operationId = startDiagnosticOperation();
    const startedAt = performance.now();
    recordDiagnosticEvent({ operationId, name, kind: 'query', phase: 'start', timestamp: Date.now() });
    logQuery(
      name,
      'fetch',
      ctx && ctx.pageParam !== undefined
        ? { operationId, pageParam: ctx.pageParam }
        : { operationId },
    );
    try {
      const result = await fn(...args);
      const durationMs = Math.max(0, performance.now() - startedAt);
      recordDiagnosticEvent({ operationId, name, kind: 'query', phase: 'success', timestamp: Date.now(), durationMs });
      // Diagnostics must never turn a successful read into a failed query.
      let summary: unknown;
      try { summary = summarize?.(result); } catch { summary = { summaryUnavailable: true }; }
      logQuery(name, 'success', { operationId, durationMs, summary });
      return result;
    } catch (error) {
      const durationMs = Math.max(0, performance.now() - startedAt);
      const cancelled = ctx?.signal?.aborted || (error instanceof Error && error.name === 'AbortError');
      recordDiagnosticEvent({ operationId, name, kind: 'query', phase: cancelled ? 'cancelled' : 'error', timestamp: Date.now(), durationMs });
      logQuery(name, 'error', { operationId, durationMs, cancelled, error });
      throw error;
    }
  }) as TFn;
}

// Compact payload summarizer for hooks that fetch arrays or RPC payloads.
// Keeps terminal output bounded — full payloads live in the React Query
// cache, not in logs.
export function summarizeResult<T>(result: T): unknown {
  if (Array.isArray(result)) {
    return { count: result.length };
  }
  if (result && typeof result === 'object') {
    const obj = result as Record<string, unknown>;
    return { keys: Object.keys(obj) };
  }
  return undefined;
}
