'use server';

import { revalidatePath } from 'next/cache';
import { requireRepresentante } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

/** Salva (ou remove, com null) a foto do próprio usuário logado. */
export async function salvarFoto(foto: string | null): Promise<{ erro?: string }> {
  const { userId } = await requireRepresentante();
  if (foto !== null && (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(foto) || foto.length > 300_000)) {
    return { erro: 'Imagem inválida ou grande demais.' };
  }
  const { error } = await createServiceRoleClient().from('representantes').update({ foto }).eq('id', userId);
  if (error) {
    return {
      erro: /foto/.test(error.message) ? 'Falta aplicar o supabase/foto_usuario.sql no banco.' : error.message,
    };
  }
  revalidatePath('/', 'layout');
  return {};
}
