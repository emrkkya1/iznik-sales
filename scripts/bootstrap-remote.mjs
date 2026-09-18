import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const profilePath = process.argv[2];
if (!profilePath) throw new Error('Usage: node scripts/bootstrap-remote.mjs <profile.json>');
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
const profile = JSON.parse(await readFile(profilePath, 'utf8'));
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

for (const user of profile.users ?? []) {
  const email = process.env[user.emailEnv];
  const password = process.env[user.passwordEnv];
  if (!email || !password) throw new Error(`Missing bootstrap credentials for ${user.role}.`);
  const { data: listed, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  let authUser = listed.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
  if (!authUser) {
    const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error('Could not create bootstrap user.');
    authUser = data.user;
  }
  const { error } = await supabase.from('users').upsert({ id: authUser.id, full_name: user.fullName, username: user.username, role: user.role, is_active: true }, { onConflict: 'id' });
  if (error) throw error;
}

for (const product of profile.products ?? []) {
  const { error } = await supabase.from('products').upsert({ name: product.name, default_price: product.defaultPrice ?? 0, is_active: true }, { onConflict: 'name' });
  if (error) throw error;
}

for (const cityConfig of profile.cities ?? []) {
  const { data: city, error: cityError } = await supabase.from('cities').upsert({ name: cityConfig.name }, { onConflict: 'name' }).select('id').single();
  if (cityError) throw cityError;
  for (const districtConfig of cityConfig.districts ?? []) {
    const { data: district, error: districtError } = await supabase.from('districts').upsert({ city_id: city.id, name: districtConfig.name }, { onConflict: 'city_id,name' }).select('id').single();
    if (districtError) throw districtError;
    for (const branchConfig of districtConfig.branches ?? []) {
      const { data: existing } = await supabase.from('branches').select('id').eq('district_id', district.id).eq('name', branchConfig.name).maybeSingle();
      if (!existing) {
        const { data: branch, error: branchError } = await supabase.from('branches').insert({ district_id: district.id, name: branchConfig.name, opening_balance: branchConfig.openingBalance ?? 0, current_balance: branchConfig.openingBalance ?? 0, is_active: true }).select('id').single();
        if (branchError) throw branchError;
        const { data: products, error: productsError } = await supabase.from('products').select('id, default_price').eq('is_active', true).is('archived_at', null);
        if (productsError) throw productsError;
        for (const product of products ?? []) {
          const { data: branchProduct, error: branchProductError } = await supabase.from('branch_products').insert({ branch_id: branch.id, product_id: product.id, is_active: true }).select('id').single();
          if (branchProductError) throw branchProductError;
          const { error: priceError } = await supabase.from('branch_product_prices').insert({ branch_product_id: branchProduct.id, price: product.default_price, start_date: new Date().toISOString().slice(0, 10) });
          if (priceError) throw priceError;
        }
      }
    }
  }
}

console.log(`Bootstrap completed: ${profilePath}`);
