'use server';

import { revalidatePath } from 'next/cache';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/auth';

const SENHA_MINIMA = 8;

export interface UsuarioFormState {
  erro?: string;
  sucesso?: string;
}

/**
 * Cria um usuário do Natuhair Finanças com a senha escolhida pelo admin.
 * Todo usuário do Cartão tem role admin (o módulo é restrito a admins), mas só
 * vê os próprios dados; o super admin é marcado direto no banco. Estado e
 * código SQL são campos do sistema de pedidos e ficam com valores fixos.
 */
export async function criarUsuario(
  _prev: UsuarioFormState | undefined,
  formData: FormData
): Promise<UsuarioFormState> {
  await requireSuperAdmin();

  const nome = String(formData.get('nome') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const senha = String(formData.get('senha') ?? '');
  const confirmacao = String(formData.get('confirmacao') ?? '');

  const acessoCartao = formData.get('acesso_cartao') === 'on';
  const acessoDevolucoes = formData.get('acesso_devolucoes') === 'on';

  if (!nome || !email) return { erro: 'Preencha nome e e-mail.' };
  if (!acessoCartao && !acessoDevolucoes) return { erro: 'Marque pelo menos um acesso: Cartão ou NF-e Recebidas.' };
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
    acesso_devolucoes: acessoDevolucoes,
    // a coluna só existe depois do supabase/acesso_cartao.sql; sem ela todos têm o Cartão
    ...(acessoCartao ? {} : { acesso_cartao: false }),
  });
  if (erroInsert) {
    await service.auth.admin.deleteUser(data.user.id);
    return { erro: 'Falha ao registrar o usuário.' };
  }

  revalidatePath('/admin/usuarios');
  return { sucesso: `Usuário ${nome} criado. Ele já pode entrar com o e-mail e a senha definidos.` };
}

export async function definirSenhaUsuario(id: string, senha: string): Promise<{ ok?: boolean; erro?: string }> {
  await requireSuperAdmin();
  if (senha.length < SENHA_MINIMA) return { erro: `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.` };

  const { error } = await createServiceRoleClient().auth.admin.updateUserById(id, { password: senha });
  return error ? { erro: error.message } : { ok: true };
}

export async function alternarAtivoUsuario(id: string, ativo: boolean): Promise<{ erro?: string }> {
  const { userId } = await requireSuperAdmin();
  if (id === userId && !ativo) return { erro: 'Você não pode desativar o próprio usuário.' };

  await createServiceRoleClient().from('representantes').update({ ativo }).eq('id', id);
  revalidatePath('/admin/usuarios');
  return {};
}

/** Libera ou retira o acesso a uma tela: Cartão ou NF-e Recebidas (controle de devoluções). */
export async function alternarAcesso(
  id: string,
  tela: 'cartao' | 'devolucoes',
  acesso: boolean
): Promise<{ erro?: string }> {
  await requireSuperAdmin();
  const coluna = tela === 'cartao' ? 'acesso_cartao' : 'acesso_devolucoes';
  const { error } = await createServiceRoleClient().from('representantes').update({ [coluna]: acesso }).eq('id', id);
  revalidatePath('/admin/usuarios');
  if (error?.message.includes('acesso_cartao')) {
    return { erro: 'Falta rodar o supabase/acesso_cartao.sql no Supabase para liberar essa opção.' };
  }
  return error ? { erro: error.message } : {};
}
