'use server';

import { revalidatePath } from 'next/cache';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireRepresentante } from '@/lib/auth';

const SENHA_MINIMA = 8;

export interface UsuarioFormState {
  erro?: string;
  sucesso?: string;
}

/**
 * Cria um usuário do Natuhair Cartão com a senha escolhida pelo admin.
 * Todo usuário do Cartão é admin (o módulo é restrito a admins); estado e
 * código SQL são campos do sistema de pedidos e ficam com valores fixos.
 */
export async function criarUsuario(
  _prev: UsuarioFormState | undefined,
  formData: FormData
): Promise<UsuarioFormState> {
  await requireRepresentante('admin');

  const nome = String(formData.get('nome') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const senha = String(formData.get('senha') ?? '');
  const confirmacao = String(formData.get('confirmacao') ?? '');

  if (!nome || !email) return { erro: 'Preencha nome e e-mail.' };
  if (senha.length < SENHA_MINIMA) return { erro: `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.` };
  if (senha !== confirmacao) return { erro: 'A confirmação não confere com a senha.' };

  const service = createServiceRoleClient();
  const { data, error } = await service.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error || !data.user) {
    const jaExiste = error?.message?.toLowerCase().includes('already');
    return { erro: jaExiste ? 'Já existe um usuário com esse e-mail.' : error?.message ?? 'Falha ao criar usuário.' };
  }

  const { error: erroInsert } = await service.from('representantes').insert({
    id: data.user.id,
    nome,
    email,
    estado: '--',
    codigo_representante_sql: 'CARTAO',
    role: 'admin',
    ativo: true,
  });
  if (erroInsert) {
    await service.auth.admin.deleteUser(data.user.id);
    return { erro: 'Falha ao registrar o usuário.' };
  }

  revalidatePath('/admin/usuarios');
  return { sucesso: `Usuário ${nome} criado. Ele já pode entrar com o e-mail e a senha definidos.` };
}

export async function definirSenhaUsuario(id: string, senha: string): Promise<{ ok?: boolean; erro?: string }> {
  await requireRepresentante('admin');
  if (senha.length < SENHA_MINIMA) return { erro: `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.` };

  const { error } = await createServiceRoleClient().auth.admin.updateUserById(id, { password: senha });
  return error ? { erro: error.message } : { ok: true };
}

export async function alternarAtivoUsuario(id: string, ativo: boolean): Promise<{ erro?: string }> {
  const { userId } = await requireRepresentante('admin');
  if (id === userId && !ativo) return { erro: 'Você não pode desativar o próprio usuário.' };

  await createServiceRoleClient().from('representantes').update({ ativo }).eq('id', id);
  revalidatePath('/admin/usuarios');
  return {};
}
