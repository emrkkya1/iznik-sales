import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('validateEnv', () => {
  it('accepts the two explicit public Supabase values', async () => {
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY', 'public-anon-key');
    vi.resetModules();

    const { validateEnv } = await import('./env');

    expect(validateEnv()).toEqual({
      EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key',
    });
  });

  it('rejects a missing public Supabase value', async () => {
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.resetModules();

    const { validateEnv } = await import('./env');

    expect(() => validateEnv()).toThrow('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  });
});
