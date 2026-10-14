// Lightweight console logging for following app activity in the terminal
// (Metro / `expo run:android` output).
import { formatDateTime } from './dates';

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
    const ctx = args[0] as { pageParam?: unknown } | undefined;
    logQuery(
      name,
      'fetch',
      ctx && ctx.pageParam !== undefined
        ? { pageParam: ctx.pageParam }
        : undefined,
    );
    try {
      const result = await fn(...args);
      logQuery(name, 'success', summarize ? summarize(result) : undefined);
      return result;
    } catch (error) {
      logQuery(name, 'error', error);
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
