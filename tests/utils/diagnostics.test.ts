import { beforeEach, describe, expect, it } from 'vitest';
import { clearDiagnosticEvents, getDiagnosticEvents, recordDiagnosticEvent, startDiagnosticOperation } from '@/utils/diagnostics';

beforeEach(clearDiagnosticEvents);

describe('bounded operation diagnostics', () => {
  it('keeps only the latest 100 metadata events without retaining extra fields', () => {
    for (let index = 0; index < 120; index++) {
      recordDiagnosticEvent({
        operationId: String(index), name: 'x'.repeat(200), kind: 'query', phase: 'start', timestamp: index,
        ...{ payload: { password: 'secret' } },
      });
    }
    const events = getDiagnosticEvents();
    expect(events).toHaveLength(100);
    expect(events[0].operationId).toBe('20');
    expect(events[99].name).toHaveLength(80);
    expect(JSON.stringify(events)).not.toContain('secret');
    events[0].name = 'changed';
    expect(getDiagnosticEvents()[0].name).not.toBe('changed');
  });

  it('assigns distinct IDs and supports clearing without reusing identities', () => {
    const first = startDiagnosticOperation();
    clearDiagnosticEvents();
    expect(startDiagnosticOperation()).not.toBe(first);
    expect(getDiagnosticEvents()).toEqual([]);
  });
});
