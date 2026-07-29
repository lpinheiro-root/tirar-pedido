import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRepresentante } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getClientePorId } from '@/lib/sqlserver';
import { PageHeading } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { ErrorNotice } from '@/components/ui/ErrorNotice';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { IconChevronLeft } from '@/components/ui/Icons';
import { IniciarPedidoButton } from './IniciarPedidoButton';

export default async function HistoricoClientePage({ params }: { params: { id: string } }) {
  const { userId } = await requireRepresentante('representante');

  let cliente;
  try {
    cliente = await getClientePorId(params.id);
  } catch (err) {
    console.error('Falha ao conectar ao SQL Server:', err);
    return (
      <div>
        <Link
          href="/representante/clientes"
          className="mb-4 inline-flex items-center gap-1 text-body-sm text-on-surface-variant hover:text-primary"
        >
          <IconChevronLeft width={16} height={16} /> Voltar aos clientes
        </Link>
        <ErrorNotice
          title="Não foi possível conectar ao SQL Server de clientes"
          message="Verifique as variáveis SQLSERVER_HOST, SQLSERVER_USER, SQLSERVER_PASSWORD e SQLSERVER_DATABASE no .env.local."
        />
      </div>
    );
  }
  if (!cliente) notFound();

  const supabase = createClient();
  const { data: pedidos } = await supabase
    .from('pedidos')
    .select('*, pedido_itens(quantidade, subtotal)')
    .eq('representante_id', userId)
    .eq('cliente_id_sql', params.id)
    .order('criado_em', { ascending: false });

  return (
    <div>
      <Link
        href="/representante/clientes"
        className="mb-4 inline-flex items-center gap-1 text-body-sm text-on-surface-variant hover:text-primary"
      >
        <IconChevronLeft width={16} height={16} /> Voltar aos clientes
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4">
        <PageHeading
          title={cliente.nome}
          subtitle={`${cliente.cidade} — ${cliente.estado} · Histórico de pedidos`}
        />
        <IniciarPedidoButton clienteId={cliente.id} clienteNome={cliente.nome} />
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-container-low">
              <tr className="text-label uppercase text-on-surface-variant">
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Itens</th>
                <th className="px-4 py-3 font-medium">Valor Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {pedidos?.map((pedido) => {
                const itens = pedido.pedido_itens as { quantidade: number; subtotal: number }[];
                const total = itens.reduce((acc, i) => acc + Number(i.subtotal), 0);
                const qtd = itens.reduce((acc, i) => acc + Number(i.quantidade), 0);
                return (
                  <tr key={pedido.id} className="border-t border-border-muted">
                    <td className="px-4 py-3 text-body-sm text-on-surface-variant">
                      {formatDateTime(pedido.criado_em)}
                    </td>
                    <td className="px-4 py-3 text-body text-on-surface">{qtd} itens</td>
                    <td className="px-4 py-3 text-body font-medium text-on-surface">
                      {formatCurrency(total)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={pedido.status} />
                    </td>
                  </tr>
                );
              })}
              {(!pedidos || pedidos.length === 0) && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-body-sm text-on-surface-variant">
                    Nenhum pedido registrado para este cliente ainda.
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
