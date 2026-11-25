'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Avatar } from '@/components/ui/Avatar';

export interface SidebarLink {
  href: string;
  label: string;
  icon: React.ReactNode;
}

export function Sidebar({
  links,
  nome,
  foto,
  subtitulo,
  footer,
  titulo = 'Natuhair Pedidos',
  logo,
}: {
  links: SidebarLink[];
  nome: string;
  foto?: string | null;
  subtitulo: string;
  footer?: React.ReactNode;
  titulo?: string;
  /** Imagem no lugar do ícone padrão (ex.: /natuhair-logo.jpg). */
  logo?: string;
}) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-64 print:hidden shrink-0 flex-col justify-between border-r border-white/70 bg-white/60 shadow-[8px_0_30px_-20px_rgba(79,70,229,0.35)] backdrop-blur-xl">
      <div className="min-h-0 overflow-y-auto">
        <div className="flex flex-col items-center gap-2 px-6 pb-5 pt-6">
          {logo ? (
            // A imagem tem margem branca: o recorte redondo + zoom deixa só o círculo azul.
            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full shadow-lg shadow-primary/30 ring-4 ring-primary/10 transition-transform duration-300 hover:rotate-6 hover:scale-105">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} alt={titulo} className="h-full w-full scale-[1.12] object-cover" />
            </div>
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-on-primary">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
          )}
          <span className={logo ? 'text-[22px] font-extrabold tracking-tight text-primary' : 'text-h2 text-primary'}>{titulo}</span>
        </div>

        <nav className="flex flex-col gap-1 px-3">
          {links.map((link) => {
            const isAncestorOfSibling = links.some(
              (l) => l.href !== link.href && l.href.startsWith(link.href)
            );
            const active =
              pathname === link.href ||
              (!isAncestorOfSibling && pathname.startsWith(`${link.href}/`));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-body font-semibold transition-all duration-200 ease-out ${
                  active
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-500 text-white shadow-lg shadow-blue-500/30'
                    : 'text-on-surface hover:-translate-y-0.5 hover:translate-x-1 hover:scale-[1.03] hover:bg-white hover:text-primary hover:shadow-md hover:shadow-blue-500/15 active:scale-95'
                }`}
              >
                {link.icon}
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-border-muted px-4 py-4">
        <div className="flex items-center gap-3">
          <Avatar nome={nome} foto={foto} />
          <div className="min-w-0">
            <p className="truncate text-body font-medium text-on-surface">{nome}</p>
            <p className="truncate text-label text-on-surface-variant">{subtitulo}</p>
          </div>
        </div>
        {footer && <div className="mt-3">{footer}</div>}
      </div>
    </aside>
  );
}
