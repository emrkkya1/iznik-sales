import type { PaymentRepository } from '@/services/contracts';
import type { ManualPaymentInput, Payment, PaymentType } from '@/types';

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
  async recordManualPayment(input: ManualPaymentInput, idempotencyKey?: string) {
    const { data, error } = await supabaseClient.rpc(
      'record_manual_payment_atomic',
      {
        p_branch_id: input.branchId,
        p_amount: input.amount,
        p_payment_type: input.paymentType,
        p_date: input.date,
        p_idempotency_key: idempotencyKey,
      },
    );

    if (error) throw error;

    const { data: payment, error: fetchError } = await supabaseClient
      .from('payments')
      .select(
        'id, branch_id, user_id, delivery_id, amount, payment_type, date, deleted_at, deleted_by, deletion_reason',
      )
      .eq('id', data)
      .single();

    if (fetchError) throw fetchError;

    return {
      id: payment.id,
      branchId: payment.branch_id ?? '',
      userId: payment.user_id ?? '',
      deliveryId: payment.delivery_id,
      amount: payment.amount,
      paymentType: payment.payment_type as PaymentType,
      date: payment.date,
      deletedAt: payment.deleted_at,
      deletedBy: payment.deleted_by,
      deletionReason: payment.deletion_reason,
    } satisfies Payment;
  },
};
