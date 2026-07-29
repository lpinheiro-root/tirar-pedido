'use client';

import { useState } from 'react';
import { atualizarProdutoConfig } from './actions';
import { formatCurrency } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { Produto } from '@/types';

export function ProdutoConfigRow({
  produto,
  precoOverride,
  ativoConfig,
}: {
  produto: Produto;
  precoOverride: number | null;
  ativoConfig: boolean;
}) {
  const [editando, setEditando] = useState(false);

  return (
    <>
      <tr className="border-t border-border-muted">
        <td className="px-4 py-3">
          <p className="text-body font-medium text-on-surface">{produto.nome}</p>
          <p className="text-label text-on-surface-variant">SKU {produto.codigo}</p>
        </td>
        <td className="px-4 py-3 text-body-sm text-on-surface-variant">{produto.grupoNome}</td>
        <td className="px-4 py-3 text-body text-on-surface">
          {formatCurrency(precoOverride ?? produto.preco)}
          {precoOverride !== null && (
            <span className="ml-1 text-label text-secondary">(ajustado)</span>
          )}
        </td>
        <td className="px-4 py-3 text-body-sm text-on-surface-variant">{produto.estoque} un</td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex items-center rounded-sm px-2 py-1 text-label font-medium ${
              ativoConfig ? 'bg-green-100 text-green-700' : 'bg-error-container text-error-on-container'
            }`}
          >
            {ativoConfig ? 'Ativo' : 'Inativo'}
          </span>
        </td>
        <td className="px-4 py-3 text-right">
          <Button variant="ghost" size="sm" onClick={() => setEditando((v) => !v)}>
            Editar
          </Button>
        </td>
      </tr>
      {editando && (
        <tr className="border-t border-border-muted bg-surface-container-low/50">
          <td colSpan={6} className="px-4 py-4">
            <form
              action={async (formData) => {
                await atualizarProdutoConfig(formData);
                setEditando(false);
              }}
              className="flex flex-wrap items-end gap-4"
            >
              <input type="hidden" name="produtoIdSql" value={produto.id} />
              <div>
                <label className="mb-1 block text-label text-on-surface-variant">
                  Preço (deixe vazio para usar o preço padrão)
                </label>
                <Input
                  name="precoOverride"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={precoOverride ?? ''}
                  compact
                  className="w-40"
                />
              </div>
              <label className="flex items-center gap-2 text-body-sm text-on-surface">
                <input
                  type="checkbox"
                  name="ativo"
                  defaultChecked={ativoConfig}
                  className="h-4 w-4 rounded-sm border-[#D1D5DB] text-primary focus:ring-primary"
                />
                Disponível no catálogo
              </label>
              <Button type="submit" size="sm">
                Salvar
              </Button>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
