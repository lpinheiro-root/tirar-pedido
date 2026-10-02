'use server';

import { revalidatePath } from 'next/cache';
import { requireDevolucoes } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { CAMPOS_VALIDOS } from '@/lib/devolucoes';

/** Grava uma resposta do acompanhamento de uma NFD (RLS: super admin ou acesso a devoluções). */
export async function salvarCampoDevolucao(
  chave: string,
  campo: string,
  valor: string
): Promise<{ erro?: string }> {
  const { userId } = await requireDevolucoes();
  if (!/^\d{44}$/.test(chave) || !CAMPOS_VALIDOS.has(campo)) return { erro: 'Campo inválido.' };

  const texto = valor.trim().slice(0, 500) || null;
  const { error } = await createClient()
    .from('devolucoes_acompanhamento')
    .upsert(
      { chave, [campo]: texto, atualizado_por: userId, atualizado_em: new Date().toISOString() },
      { onConflict: 'chave' }
    );
  if (error) return { erro: error.message };
  revalidatePath('/admin/nfe-recebidas');
  return {};
}
