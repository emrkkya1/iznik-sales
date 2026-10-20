import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';
import type { CreateDeliveryInput, ManualPaymentInput, UpdateDeliveryInput } from '@/types';
import { generateIdempotencyKey } from '@/utils/idempotency';
import { FinancialOutcomeUnknownError, FinancialWriteCommittedError, FinancialWriteRejectedError, PendingFinancialOperationError } from './financialOperationErrors';

type Inputs = { create_delivery: CreateDeliveryInput; update_delivery: UpdateDeliveryInput; manual_payment: ManualPaymentInput };
export type FinancialOperationKind = keyof Inputs;
const identifier = z.string().min(1).max(200);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const quantity = z.number().finite().nonnegative().lt(10000000000);
const items = z.array(z.object({ productId: identifier, deliveredQuantity: quantity, returnedQuantity: quantity })).min(1).max(200);
const paymentType = z.enum(['field_collection', 'bank_transfer']);
const common = { version: z.literal(1), actorId: identifier, key: identifier };
const pendingSchema = z.discriminatedUnion('kind', [
  z.object({ ...common, kind: z.literal('create_delivery'), input: z.object({ branchId: identifier, items, paymentAmount: quantity, paymentType, date }) }),
  z.object({ ...common, kind: z.literal('update_delivery'), input: z.object({ deliveryId: identifier, items, date }) }),
  z.object({ ...common, kind: z.literal('manual_payment'), input: z.object({ branchId: identifier, amount: quantity.positive(), paymentType, date }) }),
]);
export type PendingFinancialOperation = z.infer<typeof pendingSchema>;

function storageKey(actorId: string, kind: FinancialOperationKind): string {
  return `financial-operation:v1:${actorId}:${kind}`;
}

function canonical<K extends FinancialOperationKind>(kind: K, input: Inputs[K]): Inputs[K] {
  // A JSON snapshot prevents an in-flight caller mutating its request. The
  // schema strips extra fields; ordering changes do not create new operations.
  const parsed = pendingSchema.parse({ version: 1, actorId: 'validation', key: 'validation', kind, input });
  if ('items' in parsed.input) parsed.input.items.sort((a, b) => a.productId.localeCompare(b.productId));
  return parsed.input as Inputs[K];
}

export async function getPendingFinancialOperation(actorId: string, kind: FinancialOperationKind): Promise<PendingFinancialOperation | null> {
  const stored = await AsyncStorage.getItem(storageKey(actorId, kind));
  if (stored === null) return null;
  // Corrupt or mismatched records fail closed; never silently replace a key.
  const pending = pendingSchema.parse(JSON.parse(stored));
  if (pending.actorId !== actorId || pending.kind !== kind) throw new PendingFinancialOperationError();
  return pending;
}

const active = new Map<string, { fingerprint: string; recovering: boolean; promise: Promise<unknown> }>();

export function runFinancialOperation<K extends FinancialOperationKind, T>(options: {
  actorId: string; kind: K; input: Inputs[K]; recovering?: boolean;
  execute: (input: Inputs[K], key: string) => Promise<T>;
}): Promise<T> {
  const input = canonical(options.kind, options.input);
  const key = storageKey(options.actorId, options.kind);
  const fingerprint = JSON.stringify(input);
  const recovering = options.recovering === true;
  const running = active.get(key);
  if (running) {
    if (running.fingerprint === fingerprint && running.recovering === recovering) return running.promise as Promise<T>;
    return Promise.reject(new PendingFinancialOperationError());
  }
  const promise = (async () => {
    let operation = await getPendingFinancialOperation(options.actorId, options.kind);
    if (operation) {
      // Even identical input after a remount might be an intended NEW sale.
      // Require an explicit recovery action, never silently replay on Submit.
      if (!recovering || JSON.stringify(canonical(options.kind, operation.input as Inputs[K])) !== fingerprint) throw new PendingFinancialOperationError();
    } else {
      if (recovering) throw new Error('Bekleyen işlem bulunamadı. Yeni kayıt için normal kaydet seçeneğini kullanın.');
      operation = pendingSchema.parse({ version: 1, actorId: options.actorId, kind: options.kind, key: generateIdempotencyKey(), input });
      await AsyncStorage.setItem(key, JSON.stringify(operation)); // durable BEFORE any request
    }
    let result: T;
    try {
      result = await options.execute(input, operation.key);
    } catch (error) {
      if (error instanceof FinancialWriteRejectedError) {
        await AsyncStorage.removeItem(key);
        throw error;
      }
      if (error instanceof FinancialWriteCommittedError) throw error;
      throw new FinancialOutcomeUnknownError();
    }
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      // Do not show ordinary failure or permit a fresh identity when only
      // acknowledgement cleanup failed after a successful financial write.
      throw new FinancialWriteCommittedError();
    }
    return result;
  })().finally(() => active.delete(key));
  active.set(key, { fingerprint, recovering, promise });
  return promise;
}
