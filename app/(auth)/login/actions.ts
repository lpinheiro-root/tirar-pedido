'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function login(_prevState: { erro?: string } | undefined, formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const senha = String(formData.get('senha') ?? '');
  console.log(senha, email)

  if (!email || !senha) {
    return { erro: 'Informe e-mail e senha.' };
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });

  if (error || !data.user) {
    return { erro: 'E-mail ou senha inválidos.' };
  }

  const { data: representante } = await supabase
    .from('representantes')
    .select('role, ativo')
    .eq('id', data.user.id)
    .single();

  if (!representante) {
    await supabase.auth.signOut();
    return { erro: 'Usuário sem cadastro de representante.' };
  }

  if (!representante.ativo) {
    await supabase.auth.signOut();
    return { erro: 'Este acesso está desativado. Fale com o administrador.' };
  }

  redirect(representante.role === 'admin' ? '/admin/cartao' : '/representante');
}
