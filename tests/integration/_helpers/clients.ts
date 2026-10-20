import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.TEST_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Integration env vars missing. Expected TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, TEST_SUPABASE_SERVICE_ROLE_KEY.',
  );
}

export const URL: string = SUPABASE_URL;
export const ANON_KEY: string = SUPABASE_ANON_KEY;
export const SERVICE_KEY: string = SUPABASE_SERVICE_ROLE_KEY;

export type AdminClient = SupabaseClient;
export type AnonClient = SupabaseClient;

export const ADMIN_EMAIL = 'admin@iznik.test';
export const ADMIN_PASSWORD = 'admin123';
export const STAFF_EMAIL = 'staff@iznik.test';
export const STAFF_PASSWORD = 'staff123';

const NO_AUTH = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;

async function signIn(client: SupabaseClient, email: string, password: string) {
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
}

export async function createAdminClient(): Promise<AdminClient> {
  const client = createClient(URL, ANON_KEY, NO_AUTH);
  await signIn(client, ADMIN_EMAIL, ADMIN_PASSWORD);
  return client;
}

export async function createStaffClient(): Promise<AdminClient> {
  const client = createClient(URL, ANON_KEY, NO_AUTH);
  await signIn(client, STAFF_EMAIL, STAFF_PASSWORD);
  return client;
}

export async function createAnonClient(): Promise<AnonClient> {
  return createClient(URL, ANON_KEY, NO_AUTH);
}

// Server-only fixture/provisioning client. Never sign in as an application
// user on this instance: that would replace its service-role authorization.
export function serviceClient(): AdminClient {
  return createClient(URL, SERVICE_KEY, NO_AUTH);
}
