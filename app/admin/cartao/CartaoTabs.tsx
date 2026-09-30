'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ABAS = [
  { href: '/admin/cartao', label: 'Faturas' },
  { href: '/admin/cartao/compras', label: 'Compras' },
  { href: '/admin/cartao/integracoes', label: 'Integrações' },
];

export function CartaoTabs() {
  const pathname = usePathname();
  const ativa =
    ABAS.slice(1).find((a) => pathname.startsWith(a.href))?.href ?? '/admin/cartao';

  return (
    <nav className="mb-6 flex gap-1 border-b border-border-muted">
      {ABAS.map((aba) => (
        <Link
          key={aba.href}
          href={aba.href}
          className={`-mb-px border-b-2 px-4 py-2.5 text-body font-medium transition-colors ${
            ativa === aba.href
              ? 'border-primary text-primary'
              : 'border-transparent text-on-surface-variant hover:text-on-surface'
          }`}
        >
          {aba.label}
        </Link>
      ))}
    </nav>
  );
}
