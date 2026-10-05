import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { telaInicial } from '@/lib/auth';
import type { Representante } from '@/types';

export default async function RootPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: representante } = await supabase.from('representantes').select('*').eq('id', user.id).single();

  redirect(
    representante?.role === 'admin' ? telaInicial(representante as Representante) : '/representante'
  );
}
