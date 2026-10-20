// Deliberately metadata-only and bounded. No query keys, user IDs, payloads,
// error messages or stacks are retained here. A remote crash sink is separate.
export type DiagnosticEvent = {
  operationId: string;
  name: string;
  kind: 'query' | 'mutation' | 'render';
  phase: 'start' | 'success' | 'error' | 'cancelled';
  timestamp: number;
  durationMs?: number;
};

const MAX_EVENTS = 100;
const events: DiagnosticEvent[] = [];
let sequence = 0;

export function startDiagnosticOperation(): string {
  return `${Date.now().toString(36)}-${(++sequence).toString(36)}`;
}

export function recordDiagnosticEvent(event: DiagnosticEvent): void {
  // Copy only allowed primitives: callers cannot accidentally retain a result
  // object (or mutate the stored record after recording it).
  events.push({
    operationId: event.operationId.slice(0, 80),
    name: event.name.slice(0, 80),
    kind: event.kind,
    phase: event.phase,
    timestamp: event.timestamp,
    ...(event.durationMs === undefined ? {} : { durationMs: Math.max(0, event.durationMs) }),
  });
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
}

export function getDiagnosticEvents(): DiagnosticEvent[] {
  return events.map(event => ({ ...event }));
}

export function clearDiagnosticEvents(): void {
  events.length = 0;
}
