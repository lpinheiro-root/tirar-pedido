import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function RootPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: representante } = await supabase
    .from('representantes')
    .select('role')
    .eq('id', user.id)
    .single();

  redirect(representante?.role === 'admin' ? '/admin' : '/representante');
}
