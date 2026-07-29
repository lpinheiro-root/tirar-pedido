import { requireRepresentante } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeading } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { formatCurrency, formatDateTime } from '@/lib/format';
import type { Pedido } from '@/types';

export default async function MeusPedidosPage() {
  const { userId } = await requireRepresentante('representante');
  const supabase = createClient();

  const { data: pedidos } = await supabase
    .from('pedidos')
    .select('*, pedido_itens(subtotal)')
    .eq('representante_id', userId)
    .order('criado_em', { ascending: false });

  const lista = (pedidos ?? []) as Array<Pedido & { pedido_itens: { subtotal: number }[] }>;

  return (
    <div>
      <PageHeading title="Meus Pedidos" subtitle="Histórico de todos os pedidos que você enviou." />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-container-low">
              <tr className="text-label uppercase text-on-surface-variant">
                <th className="px-4 py-3 font-medium">Pedido</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Valor</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((pedido) => {
                const total = pedido.pedido_itens.reduce((acc, i) => acc + Number(i.subtotal), 0);
                return (
                  <tr key={pedido.id} className="border-t border-border-muted">
                    <td className="px-4 py-3 text-body-sm text-on-surface-variant">
                      #{pedido.id.slice(0, 6)}
                    </td>
                    <td className="px-4 py-3 text-body font-medium text-on-surface">
                      {pedido.cliente_nome}
                    </td>
                    <td className="px-4 py-3 text-body-sm text-on-surface-variant">
                      {formatDateTime(pedido.criado_em)}
                    </td>
                    <td className="px-4 py-3 text-body font-medium text-on-surface">
                      {formatCurrency(total)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={pedido.status} />
                    </td>
                  </tr>
                );
              })}
              {lista.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-body-sm text-on-surface-variant">
                    Nenhum pedido enviado ainda.
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
