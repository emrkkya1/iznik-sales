export class PendingFinancialOperationError extends Error {
  constructor() { super('Önceki işlemin sonucu bekleniyor. Yeni kayıt oluşturmadan önce “Önceki işlemi kontrol et” seçeneğini kullanın.'); this.name = 'PendingFinancialOperationError'; }
}
export class FinancialWriteRejectedError extends Error {
  constructor(message: string) { super(message); this.name = 'FinancialWriteRejectedError'; }
}
export class FinancialWriteCommittedError extends Error {
  constructor() { super('Kayıt kaydedildi ancak sonuç onaylanamadı. Yeni kayıt oluşturmayın; önceki işlemi kontrol edin.'); this.name = 'FinancialWriteCommittedError'; }
}
export class FinancialOutcomeUnknownError extends Error {
  constructor() { super('Bağlantı kesildiği için işlemin sonucu doğrulanamadı. Yeni kayıt oluşturmayın; önceki işlemi kontrol edin.'); this.name = 'FinancialOutcomeUnknownError'; }
}

// A received SQL rejection proves rollback unless the key may describe an
// earlier transaction. Auth/transport errors are never proof of noncommit.
export function financialRpcError(error: { code?: string; message: string }): Error {
  if (/^(P0001|22\w{3}|23\w{3})$/.test(error.code ?? '')
    && !/not authorized|retry key|idempotency key belongs|legacy operation/i.test(error.message)) {
    return new FinancialWriteRejectedError(error.message);
  }
  return error instanceof Error ? error : Object.assign(new Error(error.message), { code: error.code });
}
