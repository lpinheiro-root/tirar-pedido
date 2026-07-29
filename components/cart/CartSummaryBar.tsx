'use client';

import Link from 'next/link';
import { useCart } from '@/components/cart/CartContext';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/format';
import { IconCart } from '@/components/ui/Icons';

export function CartSummaryBar() {
  const { totalItens, totalValor, clear } = useCart();

  if (totalItens === 0) return null;

  return (
    <div className="sticky bottom-0 left-0 right-0 mt-6 flex items-center justify-between rounded-md border border-border-muted bg-surface-container-lowest px-5 py-4 shadow-ambient">
      <div className="flex items-center gap-3">
        <IconCart className="text-primary" />
        <div>
          <p className="text-body-sm font-medium text-on-surface">{totalItens} itens no carrinho</p>
          <p className="text-label text-on-surface-variant">
            Total do pedido: <span className="font-semibold text-primary">{formatCurrency(totalValor)}</span>
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={clear}>
          Limpar Tudo
        </Button>
        <Link href="/representante/pedido/carrinho">
          <Button size="sm">Ver Carrinho</Button>
        </Link>
      </div>
    </div>
  );
}
