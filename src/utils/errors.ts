export type ErrorType = 'network' | 'auth' | 'validation' | 'unknown' | 'inactive';

const errorMessages: Record<ErrorType, string> = {
  network: 'Bağlantı hatası. Lütfen internet bağlantınızı kontrol edin.',
  auth: 'E-posta veya şifre hatalı.',
  validation: 'Girdiğiniz bilgileri kontrol edin.',
  inactive: 'Hesabınız devre dışı. Lütfen yöneticinizle iletişime geçin.',
  unknown: 'Bir sorun oluştu. Lütfen tekrar deneyin.',
};

interface SupabaseLikeError {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
  __isAuthError?: boolean;
}

export function getUserMessage(error: unknown): string {
  const err = error as SupabaseLikeError | null;

  if (err && typeof err === 'object') {
    if (err.name === 'InactiveAccountError' || /inactive/i.test(err.message ?? '')) {
      return errorMessages.inactive;
    }

    if (err.__isAuthError || err.name === 'AuthApiError') {
      if (err.status === 401 || err.status === 403) {
        return errorMessages.auth;
      }
    }

    const message = (err.message ?? '').toLowerCase();

    if (/staff cannot create future deliveries/.test(message)) {
      return 'Gelecek tarihli teslimat oluşturamazsınız. Bugün veya geçmiş bir tarih seçin.';
    }
    if (/no price found for product on date/.test(message)) {
      return 'Seçilen tarihte ürün fiyatı bulunamadı. Lütfen yöneticinizle iletişime geçin.';
    }
    if (/staff can only edit today's deliveries/.test(message)) {
      return 'Yalnızca bugünkü teslimatlarınızı düzenleyebilirsiniz. Geçmiş kayıtlar için yöneticinizle iletişime geçin.';
    }

    if (/invalid login credentials/.test(message)) {
      return errorMessages.auth;
    }

    if (/email not confirmed|email_confirmed/.test(message)) {
      return errorMessages.auth;
    }

    if (/jwt expired|invalid jwt|refresh token not found|session.*expire/i.test(message)) {
      return errorMessages.auth;
    }

    if (/network|fetch|connection|failed to fetch|socket/i.test(message)) {
      return errorMessages.network;
    }

    if (/validation|invalid input|violates/i.test(message)) {
      return errorMessages.validation;
    }
  }

  return errorMessages.unknown;
}

export function getErrorMessage(type: ErrorType): string {
  return errorMessages[type];
}
