import { z } from 'zod';

const envSchema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: z.string().url('Supabase URL must be a valid URL'),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'Supabase anon key is required'),
});

export type EnvConfig = z.infer<typeof envSchema>;

let validatedConfig: EnvConfig | null = null;

export function validateEnv(): EnvConfig {
  if (validatedConfig) {
    return validatedConfig;
  }

  // Expo only embeds public values that are accessed statically with dot
  // notation. Passing the entire process.env object leaves these fields
  // undefined in a production APK.
  const result = envSchema.safeParse({
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ');
    throw new Error(`Configuration error: ${errors}`);
  }

  validatedConfig = result.data;
  return validatedConfig;
}

export function getEnvConfig(): EnvConfig {
  if (!validatedConfig) {
    throw new Error('Environment not validated. Call validateEnv() first.');
  }
  return validatedConfig;
}
