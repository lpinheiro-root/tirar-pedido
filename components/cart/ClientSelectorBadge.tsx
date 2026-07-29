'use client';

import Link from 'next/link';
import { useCart } from '@/components/cart/CartContext';
import { IconUsers } from '@/components/ui/Icons';

export function ClientSelectorBadge() {
  const { cliente } = useCart();

  return (
    <Link
      href="/representante/clientes"
      className="flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-button text-on-primary hover:bg-primary/90"
    >
      <IconUsers width={16} height={16} />
      {cliente ? cliente.nome : 'Selecionar Cliente'}
    </Link>
  );
}
