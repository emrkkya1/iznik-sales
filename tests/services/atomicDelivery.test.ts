import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseDeliveryRepository } from '@/services/supabase/deliveries';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('@/services/supabase/supabaseClient', () => ({ supabaseClient: mocks }));
vi.mock('@/utils/logger', () => ({ logMutation: vi.fn() }));
const id = '00000000-0000-4000-8000-000000000001';
const receipt = { deliveryId: id, branchId: id, branchName: 'Branch', date: '2026-10-20', totalSalesAmount: 20,
  paymentAmount: 5, previousBalance: 10, newBalance: 25,
  items: [{ productName: 'Bread', deliveredQuantity: 2, returnedQuantity: 0, netQuantity: 2, unitPrice: 10, lineTotal: 20 }] };
const input = { branchId: id, items: [{ productId: id, deliveredQuantity: 2, returnedQuantity: 0 }], paymentAmount: 5, paymentType: 'field_collection' as const, date: receipt.date };
beforeEach(() => { mocks.rpc.mockReset().mockResolvedValue({ data: receipt, error: null }); mocks.from.mockClear(); });
describe('atomic delivery receipts', () => {
  it('creates and edits with one RPC each, binding the expected actor', async () => {
    expect(await supabaseDeliveryRepository.createDelivery(input, 'create-key', id)).toEqual(receipt);
    expect(await supabaseDeliveryRepository.updateDelivery({ deliveryId: id, items: input.items, date: input.date }, 'edit-key', id)).toEqual(receipt);
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(['create_delivery_with_receipt', 'update_delivery_with_receipt']);
    expect(mocks.rpc.mock.calls.map(call => call[1].p_actor_id)).toEqual([id, id]);
    expect(mocks.rpc.mock.calls[1][1].p_idempotency_key).toBe('edit-key');
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('does not mistake an invalid committed response for a rejected write', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    await expect(supabaseDeliveryRepository.createDelivery(input, 'key', id)).rejects.toMatchObject({ name: 'FinancialWriteCommittedError' });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('preserves transaction rejection separately from an ambiguous transport error', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'At least one item is required' } });
    await expect(supabaseDeliveryRepository.createDelivery(input, 'key', id)).rejects.toMatchObject({ name: 'FinancialWriteRejectedError' });
    const network = new Error('Failed to fetch');
    mocks.rpc.mockResolvedValueOnce({ data: null, error: network });
    await expect(supabaseDeliveryRepository.createDelivery(input, 'key', id)).rejects.toBe(network);
  });
});
