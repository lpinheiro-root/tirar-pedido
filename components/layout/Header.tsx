import type { ReactNode } from 'react';
import { IconBell, IconUser } from '@/components/ui/Icons';
import { UsuarioMenu } from './UsuarioMenu';

export function Header({
  rightSlot,
  usuario,
}: {
  rightSlot?: ReactNode;
  /** quem está logado: nome, e-mail e foto no canto direito */
  usuario?: { nome: string; email: string; foto?: string | null; contaHref: string };
}) {
  return (
    <header className="flex print:hidden sticky top-0 z-40 h-[72px] shrink-0 items-center justify-between border-b border-white/60 bg-white/70 px-8 backdrop-blur">
      <div className="flex-1" />
      <div className="flex items-center gap-3">
        {rightSlot}
        <button className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low">
          <IconBell />
        </button>
        {usuario ? (
          <UsuarioMenu {...usuario} />
        ) : (
          <button className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low">
            <IconUser />
          </button>
        )}
      </div>
    </header>
  );
}

export function PageHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-h1 text-on-surface">{title}</h1>
      {subtitle && <p className="mt-1 text-body text-on-surface-variant">{subtitle}</p>}
    </div>
  );
}
