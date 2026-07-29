'use client';

import { useEffect, useState } from 'react';
import { useCart } from '@/components/cart/CartContext';
import { formatCurrency } from '@/lib/format';
import { IconMinus, IconPlus } from '@/components/ui/Icons';
import type { Produto } from '@/types';

export function ProdutoCard({ produto }: { produto: Produto }) {
  const { quantidadeDe, setQuantidade, addItem } = useCart();
  const quantidade = quantidadeDe(produto.id);
  const [texto, setTexto] = useState(String(quantidade));

  useEffect(() => {
    setTexto(String(quantidade));
  }, [quantidade]);

  function alterarQuantidade(nova: number) {
    const quantidadeFinal = Math.max(0, nova);
    if (quantidadeFinal === 0) {
      setQuantidade(produto.id, 0);
      return;
    }
    addItem({
      produtoId: produto.id,
      codigo: produto.codigo,
      nome: produto.nome,
      imagemUrl: produto.imagemUrl,
      preco: produto.preco,
      quantidade: quantidadeFinal,
    });
  }

  function confirmarTexto() {
    const parsed = parseInt(texto, 10);
    if (Number.isNaN(parsed)) {
      setTexto(String(quantidade));
      return;
    }
    alterarQuantidade(parsed);
  }

  return (
    <div className="overflow-hidden rounded-md border border-border-muted bg-surface-container-lowest">
      <div className="relative aspect-square w-full bg-surface-container-low">
        {produto.destaque && (
          <span className="absolute left-2 top-2 rounded-sm bg-secondary px-2 py-0.5 text-label font-semibold text-on-secondary">
            {produto.destaque}
          </span>
        )}
        {produto.imagemUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={produto.imagemUrl} alt={produto.nome} className="h-full w-full object-cover" />
        )}
      </div>
      <div className="p-3">
        <p className="text-label text-on-surface-variant">Cód. {produto.codigo}</p>
        <p className="mt-0.5 line-clamp-2 min-h-[2.5rem] text-body-sm font-medium text-on-surface">
          {produto.nome}
        </p>
        <p className="mt-1 text-body font-semibold text-primary">{formatCurrency(produto.preco)}</p>

        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-1 rounded-full border border-border-muted">
            <button
              type="button"
              onClick={() => alterarQuantidade(quantidade - 1)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low"
              aria-label="Diminuir quantidade"
            >
              <IconMinus width={14} height={14} />
            </button>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={texto}
              onChange={(e) => setTexto(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={confirmarTexto}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
              className="w-10 border-0 bg-transparent text-center text-body-sm font-medium text-on-surface focus:outline-none"
              aria-label="Quantidade"
            />
            <button
              type="button"
              onClick={() => alterarQuantidade(quantidade + 1)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low"
              aria-label="Aumentar quantidade"
            >
              <IconPlus width={14} height={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
