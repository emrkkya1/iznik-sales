import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPendingFinancialOperation, runFinancialOperation } from '@/services/financialOperations';
import { financialRpcError, FinancialWriteCommittedError, FinancialWriteRejectedError } from '@/services/financialOperationErrors';

const storage = vi.hoisted(() => ({ values: new Map<string, string>(), getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), sequence: 0 }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));
vi.mock('@/utils/idempotency', () => ({ generateIdempotencyKey: () => `key-${++storage.sequence}` }));
const input = { branchId: 'branch', items: [{ productId: 'bread', deliveredQuantity: 2, returnedQuantity: 0 }], paymentAmount: 5,
  paymentType: 'field_collection' as const, date: '2026-10-20' };
const options = { actorId: 'actor', kind: 'create_delivery' as const, input };
beforeEach(() => {
  storage.values.clear(); storage.sequence = 0;
  storage.getItem.mockReset().mockImplementation(async key => storage.values.get(key) ?? null);
  storage.setItem.mockReset().mockImplementation(async (key, value) => { storage.values.set(key, value); });
  storage.removeItem.mockReset().mockImplementation(async key => { storage.values.delete(key); });
});

describe('durable financial operation identities', () => {
  it('persists an immutable input before the request and acknowledges only afterwards', async () => {
    const submitted = structuredClone(input);
    const execute = vi.fn(async (snapshot, key) => {
      expect(JSON.parse([...storage.values.values()][0])).toMatchObject({ key, actorId: 'actor', kind: 'create_delivery', input: snapshot });
      expect(snapshot.items[0].deliveredQuantity).toBe(2);
      return { receipt: true };
    });
    const result = runFinancialOperation({ ...options, input: submitted, execute });
    submitted.items[0].deliveredQuantity = 99;
    expect(await result).toEqual({ receipt: true });
    expect(execute).toHaveBeenCalledOnce();
    expect(storage.values.size).toBe(0);
  });

  it('coalesces duplicate taps but rejects a different overlapping submission', async () => {
    let complete!: (value: number) => void;
    const deferred = new Promise<number>(resolve => { complete = resolve; });
    const execute = vi.fn(() => deferred);
    const first = runFinancialOperation({ ...options, execute });
    const second = runFinancialOperation({ ...options, execute });
    expect(first).toBe(second);
    await expect(runFinancialOperation({ ...options, input: { ...input, paymentAmount: 9 }, execute })).rejects.toMatchObject({ name: 'PendingFinancialOperationError' });
    complete(7);
    expect(await first).toBe(7);
    expect(execute).toHaveBeenCalledOnce();
  });

  it('requires explicit recovery after a lost response, including identical input after a cold restart', async () => {
    const execute = vi.fn().mockRejectedValueOnce(new Error('Response lost')).mockResolvedValue({ receipt: true });
    await expect(runFinancialOperation({ ...options, execute })).rejects.toMatchObject({ name: 'FinancialOutcomeUnknownError' });
    const original = await getPendingFinancialOperation('actor', 'create_delivery');
    vi.resetModules();
    const restarted = await import('@/services/financialOperations');
    expect(await restarted.getPendingFinancialOperation('actor', 'create_delivery')).toEqual(original);
    await expect(restarted.runFinancialOperation({ ...options, execute })).rejects.toMatchObject({ name: 'PendingFinancialOperationError' });
    await expect(restarted.runFinancialOperation({ ...options, input: { ...input, branchId: 'other' }, execute })).rejects.toMatchObject({ name: 'PendingFinancialOperationError' });
    expect(execute).toHaveBeenCalledOnce();
    expect(await restarted.runFinancialOperation({ ...options, execute, recovering: true })).toEqual({ receipt: true });
    expect(execute.mock.calls.map(call => call[1])).toEqual(['key-1', 'key-1']);
    expect(storage.values.size).toBe(0);
  });

  it('isolates account identities and does not adopt mismatched or corrupt storage', async () => {
    await expect(runFinancialOperation({ ...options, execute: async () => { throw new Error('offline'); } })).rejects.toThrow();
    const second = vi.fn().mockResolvedValue(1);
    expect(await runFinancialOperation({ ...options, actorId: 'other-actor', execute: second })).toBe(1);
    expect(await getPendingFinancialOperation('actor', 'create_delivery')).not.toBeNull();
    const key = [...storage.values.keys()][0];
    storage.values.set(key, JSON.stringify({ ...(await getPendingFinancialOperation('actor', 'create_delivery')), actorId: 'other-actor' }));
    await expect(runFinancialOperation({ ...options, execute: second, recovering: true })).rejects.toMatchObject({ name: 'PendingFinancialOperationError' });
    storage.values.set(key, '{bad json');
    await expect(runFinancialOperation({ ...options, execute: second })).rejects.toThrow();
    expect(second).toHaveBeenCalledOnce();
  });

  it('never starts a request if durable preparation fails', async () => {
    storage.setItem.mockRejectedValueOnce(new Error('disk full'));
    const execute = vi.fn();
    await expect(runFinancialOperation({ ...options, execute })).rejects.toThrow('disk full');
    expect(execute).not.toHaveBeenCalled();
  });

  it('retains identity when acknowledgement cleanup fails after commit', async () => {
    storage.removeItem.mockRejectedValueOnce(new Error('disk error'));
    const execute = vi.fn().mockResolvedValue(1);
    await expect(runFinancialOperation({ ...options, execute })).rejects.toMatchObject({ name: 'FinancialWriteCommittedError' });
    await expect(runFinancialOperation({ ...options, execute })).rejects.toMatchObject({ name: 'PendingFinancialOperationError' });
    expect(await runFinancialOperation({ ...options, execute, recovering: true })).toBe(1);
    expect(execute.mock.calls.map(call => call[1])).toEqual(['key-1', 'key-1']);
  });

  it('keeps a committed-but-unparseable result recoverable and releases only confirmed rejection', async () => {
    const execute = vi.fn().mockRejectedValueOnce(new FinancialWriteCommittedError()).mockResolvedValue(1);
    await expect(runFinancialOperation({ ...options, execute })).rejects.toMatchObject({ name: 'FinancialWriteCommittedError' });
    expect(await runFinancialOperation({ ...options, execute, recovering: true })).toBe(1);
    await expect(runFinancialOperation({ ...options, execute: async () => { throw new FinancialWriteRejectedError('Invalid payment'); } })).rejects.toMatchObject({ name: 'FinancialWriteRejectedError' });
    expect(storage.values.size).toBe(0);
    expect(await runFinancialOperation({ ...options, input: { ...input, paymentAmount: 9 }, execute })).toBe(1);
    expect(execute.mock.calls.at(-1)?.[1]).toBe('key-3');
  });

  it('never turns an empty recovery into a new financial operation', async () => {
    const execute = vi.fn();
    await expect(runFinancialOperation({ ...options, execute, recovering: true })).rejects.toThrow('Bekleyen işlem bulunamadı');
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('financial rejection classification', () => {
  it('only releases explicit transaction rejection, not ambiguous auth/key/transport failures', () => {
    for (const code of ['P0001', '22007', '23503']) expect(financialRpcError({ code, message: 'Invalid input' }).name).toBe('FinancialWriteRejectedError');
    for (const message of ['Not authorized', 'Retry key belongs to a different operation', 'Idempotency key belongs to a different or deleted payment', 'Legacy operation requires reconciliation']) {
      expect(financialRpcError({ code: 'P0001', message }).name).not.toBe('FinancialWriteRejectedError');
    }
    for (const code of ['42501', 'PGRST303', '40001', '']) expect(financialRpcError({ code, message: 'failed' }).name).not.toBe('FinancialWriteRejectedError');
  });
});
