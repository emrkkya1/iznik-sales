import type { DeliveryRepository } from '@/services/contracts';
import type {
  Delivery,
  DeliveryItem,
  DeliveryWithItems,
  Payment,
} from '@/types';

import { toSnakeCaseItems } from '../deliveryItems';
import { financialRpcError, FinancialWriteCommittedError } from '../financialOperationErrors';
import { receiptSchema } from './receiptSchema';
import { logMutation } from '@/utils/logger';
import { supabaseClient } from './supabaseClient';
import { getIstanbulToday } from '@/utils/dates';

function mapDelivery(row: {
  id: string;
  branch_id: string | null;
  user_id: string | null;
  total_sales_amount: number;
  date: string;
  idempotency_key: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  deletion_reason: string | null;
  created_at: string | null;
}): Delivery {
  return {
    id: row.id,
    branchId: row.branch_id ?? '',
    userId: row.user_id ?? '',
    totalSalesAmount: row.total_sales_amount,
    date: row.date,
    idempotencyKey: row.idempotency_key,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    deletionReason: row.deletion_reason,
    createdAt: row.created_at ?? '',
  };
}

function mapDeliveryItem(row: {
  id: string;
  delivery_id: string | null;
  product_id: string | null;
  delivered_quantity: number;
  returned_quantity: number;
  net_quantity: number | null;
  unit_price: number;
}): DeliveryItem {
  return {
    id: row.id,
    deliveryId: row.delivery_id ?? '',
    productId: row.product_id ?? '',
    deliveredQuantity: row.delivered_quantity,
    returnedQuantity: row.returned_quantity,
    netQuantity: row.net_quantity ?? 0,
    unitPrice: row.unit_price,
  };
}

function mapPayment(row: {
  id: string;
  branch_id: string | null;
  user_id: string | null;
  delivery_id: string | null;
  amount: number;
  payment_type: string;
  date: string;
  deleted_at: string | null;
  deleted_by: string | null;
  deletion_reason: string | null;
}): Payment {
  return {
    id: row.id,
    branchId: row.branch_id ?? '',
    userId: row.user_id ?? '',
    deliveryId: row.delivery_id,
    amount: row.amount,
    paymentType: row.payment_type as 'field_collection' | 'bank_transfer',
    date: row.date,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    deletionReason: row.deletion_reason,
  };
}

export const supabaseDeliveryRepository: DeliveryRepository = {
  async listMyDeliveries() {
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabaseClient
      .from('deliveries')
      .select(
        'id, branch_id, user_id, total_sales_amount, date, idempotency_key, deleted_at, deleted_by, deletion_reason, created_at, branches (name)',
      )
      .eq('user_id', user.id)
      .eq('date', getIstanbulToday())
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data ?? []).map((row) => ({
      ...mapDelivery(row),
      branchName:
        (row as { branches: { name: string } | null }).branches?.name ?? '—',
    }));
  },

  async getDelivery(id) {
    const { data, error } = await supabaseClient
      .from('deliveries')
      .select(
        `
        id,
        branch_id,
        user_id,
        total_sales_amount,
        date,
        idempotency_key,
        deleted_at,
        deleted_by,
        deletion_reason,
        created_at,
        branches (name),
        delivery_items (
          id, delivery_id, product_id, delivered_quantity, returned_quantity, net_quantity, unit_price,
          products (name)
        ),
        payments (
          id, branch_id, user_id, delivery_id, amount, payment_type, date, deleted_at, deleted_by, deletion_reason
        )
      `,
      )
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;

    if (!data) return null;

    const delivery = data as {
      id: string;
      branch_id: string;
      user_id: string;
      total_sales_amount: number;
      date: string;
      idempotency_key: string | null;
      deleted_at: string | null;
      deleted_by: string | null;
      deletion_reason: string | null;
      created_at: string;
      branches: { name: string } | null;
      delivery_items: {
        id: string;
        delivery_id: string;
        product_id: string;
        delivered_quantity: number;
        returned_quantity: number;
        net_quantity: number;
        unit_price: number;
        products: { name: string } | null;
      }[];
      payments: {
        id: string;
        branch_id: string;
        user_id: string;
        delivery_id: string | null;
        amount: number;
        payment_type: 'field_collection' | 'bank_transfer';
        date: string;
        deleted_at: string | null;
        deleted_by: string | null;
        deletion_reason: string | null;
      }[];
    };

    const items = delivery.delivery_items.map((item) => ({
      ...mapDeliveryItem(item),
      productName: item.products?.name ?? '—',
    }));

    return {
      ...mapDelivery(delivery),
      branchName: delivery.branches?.name ?? '—',
      items,
      payments: delivery.payments.map(mapPayment),
    } satisfies DeliveryWithItems;
  },

  async createDelivery(input, idempotencyKey, actorId) {
    const { data, error } = await supabaseClient.rpc('create_delivery_with_receipt', {
      p_branch_id: input.branchId,
      p_items: toSnakeCaseItems(input.items),
      p_payment_amount: input.paymentAmount,
      p_payment_type: input.paymentType,
      p_date: input.date,
      p_idempotency_key: idempotencyKey,
      p_actor_id: actorId,
    });

    if (error) throw financialRpcError(error);
    logMutation('create_delivery_with_receipt', 'success', { phase: 'write_committed', idempotencyKey });
    const receipt = receiptSchema.safeParse(data);
    if (!receipt.success) throw new FinancialWriteCommittedError();
    return receipt.data;
  },

  async updateDelivery(input, idempotencyKey, actorId) {
    const { data, error } = await supabaseClient.rpc('update_delivery_with_receipt', {
      p_delivery_id: input.deliveryId,
      p_items: toSnakeCaseItems(input.items),
      p_date: input.date,
      p_idempotency_key: idempotencyKey,
      p_actor_id: actorId,
    });

    if (error) throw financialRpcError(error);
    logMutation('update_delivery_with_receipt', 'success', { phase: 'write_committed', idempotencyKey });
    const receipt = receiptSchema.safeParse(data);
    if (!receipt.success) throw new FinancialWriteCommittedError();
    return receipt.data;
  },

  async softDeleteDelivery(id, reason) {
    const { error } = await supabaseClient.rpc('soft_delete_delivery_atomic', {
      p_delivery_id: id,
      p_deletion_reason: reason,
    });

    if (error) throw error;
  },
};
