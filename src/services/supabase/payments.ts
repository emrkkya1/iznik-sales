import type { PaymentRepository } from '@/services/contracts';
import type { ManualPaymentInput } from '@/types';
import { financialRpcError, FinancialWriteCommittedError } from '../financialOperationErrors';
import { paymentReceiptSchema } from './receiptSchema';
import { logMutation } from '@/utils/logger';

import { supabaseClient } from './supabaseClient';
import { parseBulkPaymentResult } from './bulkPaymentSchema';

export const supabasePaymentRepository: PaymentRepository = {
  async closeReceivables(input, idempotencyKey) {
    const { data, error } = await supabaseClient.rpc('close_branch_receivables', {
      p_branches: input.branches,
      p_payment_type: input.paymentType,
      p_date: input.date,
      p_idempotency_key: idempotencyKey,
    });
    if (error) {
      if (error.message === 'Branch balances changed. Refresh and confirm again.') {
        throw new Error('Şube bakiyeleri değişti. Listeyi yenileyip tekrar onaylayın.');
      }
      throw error;
    }
    return parseBulkPaymentResult(data);
  },
  async recordManualPayment(input: ManualPaymentInput, idempotencyKey: string, actorId: string) {
    const { data, error } = await supabaseClient.rpc(
      'record_manual_payment_with_receipt',
      {
        p_branch_id: input.branchId,
        p_amount: input.amount,
        p_payment_type: input.paymentType,
        p_date: input.date,
        p_idempotency_key: idempotencyKey,
        p_actor_id: actorId,
      },
    );

    if (error) throw financialRpcError(error);
    logMutation('record_manual_payment_with_receipt', 'success', { phase: 'write_committed', idempotencyKey });
    const receipt = paymentReceiptSchema.safeParse(data);
    if (!receipt.success) throw new FinancialWriteCommittedError();
    return receipt.data;
  },
};
