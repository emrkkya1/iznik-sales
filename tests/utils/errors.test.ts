import { describe, it, expect } from 'vitest';

import { getUserMessage } from '@/utils/errors';

describe('getUserMessage', () => {
  it.each([
    ['Staff cannot create future deliveries', 'Gelecek tarihli teslimat oluşturamazsınız. Bugün veya geçmiş bir tarih seçin.'],
    ['No price found for product on date 2026-01-01', 'Seçilen tarihte ürün fiyatı bulunamadı. Lütfen yöneticinizle iletişime geçin.'],
    ["Staff can only edit today's deliveries", 'Yalnızca bugünkü teslimatlarınızı düzenleyebilirsiniz. Geçmiş kayıtlar için yöneticinizle iletişime geçin.'],
  ])('explains delivery failures: %s', (message, expected) => {
    expect(getUserMessage({ message })).toBe(expected);
  });
  it('maps invalid credentials to auth message', () => {
    expect(getUserMessage({ message: 'Invalid login credentials' })).toBe(
      'E-posta veya şifre hatalı.',
    );
  });

  it('maps expired JWT to auth message', () => {
    expect(getUserMessage({ message: 'JWT expired' })).toBe(
      'E-posta veya şifre hatalı.',
    );
  });

  it('maps network errors to network message', () => {
    expect(getUserMessage({ message: 'Failed to fetch' })).toBe(
      'Bağlantı hatası. Lütfen internet bağlantınızı kontrol edin.',
    );
  });

  it('maps inactive account to inactive message', () => {
    const error = new Error('inactive account');
    error.name = 'InactiveAccountError';
    expect(getUserMessage(error)).toBe(
      'Hesabınız devre dışı. Lütfen yöneticinizle iletişime geçin.',
    );
  });

  it('falls back to unknown message for unrecognized errors', () => {
    expect(getUserMessage(new Error('something weird'))).toBe(
      'Bir sorun oluştu. Lütfen tekrar deneyin.',
    );
  });

  it('handles null/undefined gracefully', () => {
    expect(getUserMessage(null)).toBe('Bir sorun oluştu. Lütfen tekrar deneyin.');
    expect(getUserMessage(undefined)).toBe('Bir sorun oluştu. Lütfen tekrar deneyin.');
  });
});
