import type { FinancialMovementRepository } from '@/services/contracts';
import {
  currentFinancialMovementSchema, financialChangeResultSchema, financialEventSchema,
} from './financialMovementSchema';
import { supabaseClient } from './supabaseClient';

function throwMovementError(error: { message: string }) {
  if (error.message === 'Movement changed. Reopen and try again.') {
    throw new Error('Bu hareket başka bir işlemle değişti. Pencereyi kapatıp yeniden açın.');
  }
  if (error.message === 'Movement not found or deleted') {
    throw new Error('Bu hareket bulunamadı veya silindi. Listeyi yenileyin.');
  }
  throw error;
}

export const supabaseFinancialMovementRepository: FinancialMovementRepository = {
  async list(cursor, limit = 50) {
    const { data, error } = await supabaseClient.rpc('list_financial_movement_events', {
      p_limit: limit, p_cursor: cursor ?? undefined,
    });
    if (error) throw error;
    const entries = financialEventSchema.array().parse(data);
    const rows = entries.slice(0, limit);
    const last = rows.at(-1);
    return { rows, nextCursor: entries.length > limit && last ? { at: last.occurredAt, id: last.id } : null };
  },
  async get(kind, id) {
    const { data, error } = await supabaseClient.rpc('get_financial_movement', { p_kind: kind, p_id: id });
    if (error) throwMovementError(error);
    return currentFinancialMovementSchema.parse(data);
  },
  async change(input, key) {
    const { data, error } = await supabaseClient.rpc('change_financial_movement', {
      p_kind: input.kind, p_id: input.id, p_action: input.action,
      p_patch: input.patch, p_version: input.version, p_key: key,
    });
    if (error) throwMovementError(error);
    return financialChangeResultSchema.parse(data);
  },
};
