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
  if (!sessao.representante.super_admin) redirect(telaInicial(sessao.representante));
  return sessao;
}

/** NF-e Recebidas / devoluções: super admin ou usuário com acesso liberado. */
export async function requireDevolucoes() {
  const sessao = await requireRepresentante('admin');
  if (!acessos(sessao.representante).devolucoes) redirect(telaInicial(sessao.representante));
  return sessao;
}

/** O que cada usuário pode ver (o super admin vê tudo). */
export function acessos(r: Representante) {
  return {
    // sem a coluna ainda (SQL não rodado) vale como liberado, como era antes
    cartao: Boolean(r.super_admin) || r.acesso_cartao !== false,
    devolucoes: Boolean(r.super_admin) || Boolean(r.acesso_devolucoes),
    ecommerce: Boolean(r.super_admin) || Boolean(r.acesso_ecommerce),
  };
}

/** Primeira tela que o usuário pode abrir. */
export function telaInicial(r: Representante) {
  const a = acessos(r);
  if (a.cartao) return '/admin/cartao';
  if (a.devolucoes) return '/admin/nfe-recebidas';
  return a.ecommerce ? '/admin/ecommerce' : '/admin/conta';
}

/** Cartão: super admin ou usuário com acesso liberado. */
export async function requireCartao() {
  const sessao = await requireRepresentante('admin');
  if (!acessos(sessao.representante).cartao) redirect(telaInicial(sessao.representante));
  return sessao;
}

/** E-Commerce: super admin ou usuário com acesso liberado. */
export async function requireEcommerce() {
  const sessao = await requireRepresentante('admin');
  if (!acessos(sessao.representante).ecommerce) redirect(telaInicial(sessao.representante));
  return sessao;
}
