import Link from 'next/link';
import { IconUser } from '@/components/ui/Icons';
import { LogoutButton } from './LogoutButton';

export function SidebarFooter({ contaHref }: { contaHref: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Link
        href={contaHref}
        className="flex items-center gap-2 text-label text-on-surface-variant hover:text-primary"
      >
        <IconUser width={16} height={16} />
        Alterar senha
      </Link>
      <LogoutButton />
    </div>
  );
}
