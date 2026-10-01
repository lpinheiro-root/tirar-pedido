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
  subtitulo,
  footer,
  titulo = 'Natuhair Pedidos',
}: {
  links: SidebarLink[];
  nome: string;
  subtitulo: string;
  footer?: React.ReactNode;
  titulo?: string;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 print:hidden shrink-0 flex-col justify-between border-r border-border-muted bg-surface-container-lowest">
      <div>
        <div className="flex items-center gap-2 px-6 py-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-on-primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 6h16M4 12h16M4 18h10"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <span className="text-h2 text-primary">{titulo}</span>
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
                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-body font-medium transition-colors ${
                  active
                    ? 'bg-primary-fixed text-primary'
                    : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
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
          <Avatar nome={nome} />
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
