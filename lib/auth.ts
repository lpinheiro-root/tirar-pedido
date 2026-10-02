import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Representante } from '@/types';

/**
 * Retorna o usuário autenticado e sua linha em `representantes`.
 * Redireciona para /login se não houver sessão, ou para a área correta
 * do papel oposto se `role` for informado e não bater.
 */
export async function requireRepresentante(role?: 'representante' | 'admin'): Promise<{
  userId: string;
  representante: Representante;
}> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: representante, error } = await supabase
    .from('representantes')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !representante) redirect('/login');

  if (!representante.ativo) redirect('/login?erro=inativo');

  if (role && representante.role !== role) {
    redirect(representante.role === 'admin' ? '/admin' : '/representante');
  }

  return { userId: user.id, representante: representante as Representante };
}

/** Natuhair Finanças: exige o super admin (vê tudo e gerencia usuários). */
export async function requireSuperAdmin() {
  const sessao = await requireRepresentante('admin');
  if (!sessao.representante.super_admin) redirect('/admin/cartao');
  return sessao;
}
