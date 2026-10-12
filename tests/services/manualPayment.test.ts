import { beforeEach, describe, expect, it, vi } from 'vitest';

import { supabasePaymentRepository } from '@/services/supabase/payments';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), single: vi.fn() }));
vi.mock('@/services/supabase/supabaseClient', () => ({ supabaseClient: { rpc: mocks.rpc, from: mocks.from } }));

const input = { branchId: 'branch-1', amount: 125.5, paymentType: 'bank_transfer' as const, date: '2026-10-12' };
const row = {
  id: 'payment-1', branch_id: input.branchId, user_id: 'admin-1', delivery_id: null,
  amount: input.amount, payment_type: input.paymentType, date: input.date,
  deleted_at: null, deleted_by: null, deletion_reason: null,
};

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ single: mocks.single });
  mocks.rpc.mockResolvedValue({ data: 'payment-1', error: null });
  mocks.single.mockResolvedValue({ data: row, error: null });
});

describe('manual payment repository', () => {
  it('forwards the retry key and maps the standalone payment', async () => {
    const result = await supabasePaymentRepository.recordManualPayment(input, 'retry-key');
    expect(mocks.rpc).toHaveBeenCalledWith('record_manual_payment_atomic', {
      p_branch_id: input.branchId, p_amount: input.amount, p_payment_type: input.paymentType,
      p_date: input.date, p_idempotency_key: 'retry-key',
    });
    expect(result).toEqual({
      id: 'payment-1', ...input, userId: 'admin-1', deliveryId: null,
      deletedAt: null, deletedBy: null, deletionReason: null,
    });
  });

  it('does not fetch a payment after RPC rejection', async () => {
    const error = new Error('Not authorized');
    mocks.rpc.mockResolvedValue({ data: null, error });
    await expect(supabasePaymentRepository.recordManualPayment(input, 'retry-key')).rejects.toBe(error);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('uses the same key when retrying after a post-write fetch failure', async () => {
    const error = new Error('Response lost');
    mocks.single.mockResolvedValueOnce({ data: null, error });
    await expect(supabasePaymentRepository.recordManualPayment(input, 'retry-key')).rejects.toBe(error);
    await expect(supabasePaymentRepository.recordManualPayment(input, 'retry-key')).resolves.toMatchObject({ id: 'payment-1' });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    for (const [, params] of mocks.rpc.mock.calls) expect(params.p_idempotency_key).toBe('retry-key');
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
