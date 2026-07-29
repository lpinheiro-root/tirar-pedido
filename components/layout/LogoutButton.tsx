'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { IconLogout } from '@/components/ui/Icons';

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="flex items-center gap-2 text-label text-on-surface-variant hover:text-error"
    >
      <IconLogout width={16} height={16} />
      Sair do App
    </button>
  );
}
