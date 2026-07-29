'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireRepresentante } from '@/lib/auth';

function gerarSenhaTemporaria(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

export async function alternarAtivoRepresentante(id: string, ativo: boolean) {
  await requireRepresentante('admin');
  const supabase = createClient();
  await supabase.from('representantes').update({ ativo }).eq('id', id);
  revalidatePath('/admin/representantes');
}

interface CriarRepresentanteState {
  erro?: string;
  sucesso?: boolean;
  senhaTemporaria?: string;
}

export async function criarRepresentante(
  _prevState: CriarRepresentanteState | undefined,
  formData: FormData
): Promise<CriarRepresentanteState> {
  await requireRepresentante('admin');

  const nome = String(formData.get('nome') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const telefone = String(formData.get('telefone') ?? '').trim() || null;
  const estado = String(formData.get('estado') ?? '').trim().toUpperCase();
  const codigoRepresentanteSql = String(formData.get('codigoRepresentanteSql') ?? '').trim();
  const role = String(formData.get('role') ?? 'representante') as 'representante' | 'admin';

  if (!nome || !email || !estado || !codigoRepresentanteSql) {
    return { erro: 'Preencha todos os campos obrigatórios.' };
  }

  const serviceClient = createServiceRoleClient();
  const senhaTemporaria = gerarSenhaTemporaria();

  const { data: novoUsuario, error: erroAuth } = await serviceClient.auth.admin.createUser({
    email,
    password: senhaTemporaria,
    email_confirm: true,
  });

  if (erroAuth || !novoUsuario.user) {
    return { erro: erroAuth?.message ?? 'Falha ao criar usuário de autenticação.' };
  }

  const { error: erroInsert } = await serviceClient.from('representantes').insert({
    id: novoUsuario.user.id,
    nome,
    email,
    telefone,
    estado,
    codigo_representante_sql: codigoRepresentanteSql,
    role,
    ativo: true,
  });

  if (erroInsert) {
    await serviceClient.auth.admin.deleteUser(novoUsuario.user.id);
    return { erro: 'Falha ao registrar o representante.' };
  }

  revalidatePath('/admin/representantes');
  return { sucesso: true, senhaTemporaria };
}

export async function redefinirSenhaRepresentante(
  id: string
): Promise<{ senha?: string; erro?: string }> {
  await requireRepresentante('admin');

  const serviceClient = createServiceRoleClient();
  const novaSenha = gerarSenhaTemporaria();

  const { error } = await serviceClient.auth.admin.updateUserById(id, { password: novaSenha });

  if (error) {
    return { erro: error.message ?? 'Falha ao redefinir a senha.' };
  }

  return { senha: novaSenha };
}
