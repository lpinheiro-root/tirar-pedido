import Link from 'next/link';
import { requireRepresentante } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeading } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { IconEye } from '@/components/ui/Icons';
import type { Pedido, StatusPedido } from '@/types';

const STATUS_FILTROS: { label: string; value: StatusPedido | 'todos' }[] = [
  { label: 'Todos', value: 'todos' },
  { label: 'Enviado', value: 'enviado' },
  { label: 'Processando', value: 'processando' },
  { label: 'Faturado', value: 'faturado' },
  { label: 'Cancelado', value: 'cancelado' },
];

export default async function AdminPedidosPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  await requireRepresentante('admin');
  const supabase = createClient();

  const statusAtivo = (searchParams.status ?? 'todos') as StatusPedido | 'todos';

  let query = supabase
    .from('pedidos')
    .select('*, pedido_itens(subtotal), representantes(nome)')
    .order('criado_em', { ascending: false })
    .limit(100);

  if (statusAtivo !== 'todos') {
    query = query.eq('status', statusAtivo);
  }

  const { data: pedidos } = await query;
  const lista = (pedidos ?? []) as Array<
    Pedido & { pedido_itens: { subtotal: number }[]; representantes: { nome: string } | null }
  >;

  return (
    <div>
      <PageHeading title="Pedidos" subtitle="Todos os pedidos enviados por todos os representantes." />

      <div className="mb-4 flex gap-2">
        {STATUS_FILTROS.map((filtro) => (
          <Link
            key={filtro.value}
            href={filtro.value === 'todos' ? '/admin/pedidos' : `/admin/pedidos?status=${filtro.value}`}
            className={`rounded-full px-3 py-1.5 text-body-sm font-medium ${
              statusAtivo === filtro.value
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            {filtro.label}
          </Link>
        ))}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-container-low">
              <tr className="text-label uppercase text-on-surface-variant">
                <th className="px-4 py-3 font-medium">Pedido</th>
                <th className="px-4 py-3 font-medium">Representante</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Valor</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((pedido) => {
                const valor = pedido.pedido_itens.reduce((s, i) => s + Number(i.subtotal), 0);
                return (
                  <tr key={pedido.id} className="border-t border-border-muted hover:bg-surface-container-low/50">
                    <td className="px-4 py-3 text-body-sm text-on-surface-variant">
                      #{pedido.id.slice(0, 6)}
                    </td>
                    <td className="px-4 py-3 text-body text-on-surface">
                      {pedido.representantes?.nome ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-body text-on-surface">{pedido.cliente_nome}</td>
                    <td className="px-4 py-3 text-body-sm text-on-surface-variant">
                      {formatDateTime(pedido.criado_em)}
                    </td>
                    <td className="px-4 py-3 text-body font-medium text-on-surface">
                      {formatCurrency(valor)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={pedido.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/pedidos/${pedido.id}`}
                        className="inline-flex items-center gap-1 text-body-sm font-medium text-primary hover:underline"
                      >
                        <IconEye width={16} height={16} /> Ver
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {lista.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-body-sm text-on-surface-variant">
                    Nenhum pedido encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
