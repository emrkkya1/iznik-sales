import { beforeEach, describe, expect, it, vi } from 'vitest';

import { supabasePaymentRepository } from '@/services/supabase/payments';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), single: vi.fn() }));
vi.mock('@/services/supabase/supabaseClient', () => ({ supabaseClient: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock('@/utils/logger', () => ({ logMutation: vi.fn() }));

const actor = '00000000-0000-4000-8000-000000000001';
const input = { branchId: '00000000-0000-4000-8000-000000000002', amount: 125.5, paymentType: 'bank_transfer' as const, date: '2026-10-12' };
const row = {
  id: '00000000-0000-4000-8000-000000000003', ...input, userId: actor, deliveryId: null,
  deletedAt: null, deletedBy: null, deletionReason: null,
};

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ single: mocks.single });
  mocks.rpc.mockResolvedValue({ data: row, error: null });
  mocks.single.mockResolvedValue({ data: row, error: null });
});

describe('manual payment repository', () => {
  it('forwards the retry key and maps the standalone payment', async () => {
    const result = await supabasePaymentRepository.recordManualPayment(input, 'retry-key', actor);
    expect(mocks.rpc).toHaveBeenCalledWith('record_manual_payment_with_receipt', {
      p_branch_id: input.branchId, p_amount: input.amount, p_payment_type: input.paymentType,
      p_date: input.date, p_idempotency_key: 'retry-key', p_actor_id: actor,
    });
    expect(result).toEqual(row);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('does not fetch a payment after RPC rejection', async () => {
    const error = new Error('Not authorized');
    mocks.rpc.mockResolvedValue({ data: null, error });
    await expect(supabasePaymentRepository.recordManualPayment(input, 'retry-key', actor)).rejects.toBe(error);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('uses the same key after a lost RPC response without issuing a post-write read', async () => {
    const error = new Error('Response lost');
    mocks.rpc.mockResolvedValueOnce({ data: null, error });
    await expect(supabasePaymentRepository.recordManualPayment(input, 'retry-key', actor)).rejects.toBe(error);
    await expect(supabasePaymentRepository.recordManualPayment(input, 'retry-key', actor)).resolves.toEqual(row);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    for (const [, params] of mocks.rpc.mock.calls) expect(params.p_idempotency_key).toBe('retry-key');
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('distinguishes committed malformed receipts from transaction rejection', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: {}, error: null });
    await expect(supabasePaymentRepository.recordManualPayment(input, 'retry-key', actor)).rejects.toMatchObject({ name: 'FinancialWriteCommittedError' });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'Invalid payment amount' } });
    await expect(supabasePaymentRepository.recordManualPayment(input, 'retry-key', actor)).rejects.toMatchObject({ name: 'FinancialWriteRejectedError' });
  });
});

describe('bulk receivable repository', () => {
  const input = { branches: [{ branchId: '00000000-0000-4000-8000-000000000001', expectedAmount: 10 }], paymentType: 'bank_transfer' as const, date: '2026-10-12' };
  it('forwards the confirmed snapshot and retry key and validates its receipt', async () => {
    const receipt = { payments: [{ branchId: input.branches[0].branchId, paymentId: '00000000-0000-4000-8000-000000000002', amount: 10 }], totalAmount: 10 };
    mocks.rpc.mockResolvedValue({ data: receipt, error: null });
    expect(await supabasePaymentRepository.closeReceivables(input, 'batch-key')).toEqual(receipt);
    expect(mocks.rpc).toHaveBeenCalledWith('close_branch_receivables', { p_branches: input.branches, p_payment_type: input.paymentType, p_date: input.date, p_idempotency_key: 'batch-key' });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('maps stale-balance errors into a clear Turkish reconfirmation message', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Branch balances changed. Refresh and confirm again.' } });
    await expect(supabasePaymentRepository.closeReceivables(input, 'batch-key')).rejects.toThrow('Şube bakiyeleri değişti. Listeyi yenileyip tekrar onaylayın.');
  });
});
