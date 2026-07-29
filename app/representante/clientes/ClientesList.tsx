'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart } from '@/components/cart/CartContext';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { IconSearch } from '@/components/ui/Icons';
import type { Cliente } from '@/types';

export function ClientesList({ clientes }: { clientes: Cliente[] }) {
  const [busca, setBusca] = useState('');
  const { setCliente } = useCart();
  const router = useRouter();

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return clientes;
    return clientes.filter(
      (c) => c.nome.toLowerCase().includes(termo) || c.cidade?.toLowerCase().includes(termo)
    );
  }, [clientes, busca]);

  function iniciarPedido(cliente: Cliente) {
    setCliente({ id: cliente.id, nome: cliente.nome });
    router.push('/representante/produtos');
  }

  return (
    <div>
      <div className="relative mb-5 max-w-sm">
        <IconSearch
          width={16}
          height={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline"
        />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cliente por nome ou cidade..."
          className="pl-9"
        />
      </div>

      <div className="overflow-hidden rounded-md border border-border-muted">
        <table className="w-full text-left">
          <thead className="bg-surface-container-low">
            <tr className="text-label uppercase text-on-surface-variant">
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Cidade</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((cliente) => (
              <tr key={cliente.id} className="border-t border-border-muted hover:bg-surface-container-low/50">
                <td className="px-4 py-3 text-body font-medium text-on-surface">{cliente.nome}</td>
                <td className="px-4 py-3 text-body-sm text-on-surface-variant">{cliente.cidade}</td>
                <td className="px-4 py-3 text-body-sm text-on-surface-variant">{cliente.estado}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <Link href={`/representante/clientes/${cliente.id}/historico`}>
                      <Button variant="ghost" size="sm">
                        Ver histórico
                      </Button>
                    </Link>
                    <Button size="sm" onClick={() => iniciarPedido(cliente)}>
                      Fazer pedido
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-body-sm text-on-surface-variant">
                  Nenhum cliente encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
