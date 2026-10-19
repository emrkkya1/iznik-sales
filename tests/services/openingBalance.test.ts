import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseAdminLocationRepository } from '@/services/supabase/adminLocations';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/services/supabase/supabaseClient', () => ({ supabaseClient: { rpc } }));
beforeEach(() => rpc.mockReset());

describe('opening balance repository', () => {
  const input = { branchId: 'branch-1', openingBalance: -125.5, expectedOpeningBalance: 10 };
  it('forwards the signed absolute value and expected starting value to the RPC', async () => {
    rpc.mockResolvedValue({ error: null });
    await supabaseAdminLocationRepository.updateOpeningBalance(input);
    expect(rpc).toHaveBeenCalledWith('update_branch_opening_balance', { p_branch_id: input.branchId, p_opening_balance: -125.5, p_expected_opening_balance: 10 });
  });
  it.each([
    ['Opening balances are locked', 'Açılış bakiyeleri kilitli. Değişiklik yapılamaz.'],
    ['Opening balance changed. Reopen and try again.', 'Açılış bakiyesi başka bir işlemle değişti. Pencereyi kapatıp yeniden açın.'],
    ['Invalid opening balance', 'Geçerli, en fazla iki ondalık basamaklı bir tutar girin.'],
    ['Branch not found', 'Şube bulunamadı. Listeyi yenileyin.'],
  ])('maps %s into actionable Turkish copy', async (message, expected) => {
    rpc.mockResolvedValue({ error: { message } });
    await expect(supabaseAdminLocationRepository.updateOpeningBalance(input)).rejects.toThrow(expected);
  });
  it('preserves unknown errors for diagnostics', async () => {
    const error = { message: 'Not authorized' };
    rpc.mockResolvedValue({ error });
    await expect(supabaseAdminLocationRepository.updateOpeningBalance(input)).rejects.toBe(error);
  });
});
