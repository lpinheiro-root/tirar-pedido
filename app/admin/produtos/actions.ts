'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireRepresentante } from '@/lib/auth';

export async function atualizarProdutoConfig(formData: FormData) {
  await requireRepresentante('admin');

  const produtoIdSql = String(formData.get('produtoIdSql'));
  const ativo = formData.get('ativo') === 'on';
  const precoOverrideRaw = String(formData.get('precoOverride') ?? '').trim();
  const precoOverride = precoOverrideRaw ? Number(precoOverrideRaw) : null;

  const supabase = createClient();
  await supabase.from('produtos_config').upsert({
    produto_id_sql: produtoIdSql,
    ativo,
    preco_override: precoOverride,
    atualizado_em: new Date().toISOString(),
  });

  revalidatePath('/admin/produtos');
}
