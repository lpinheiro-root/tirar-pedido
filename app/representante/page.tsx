import Link from 'next/link';
import { requireRepresentante } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeading } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { IconBox, IconClipboard, IconArrowRight } from '@/components/ui/Icons';
import type { Pedido } from '@/types';

export default async function RepresentanteWelcomePage() {
  const { userId, representante } = await requireRepresentante('representante');
  const supabase = createClient();

  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);

  const { data: pedidosMes } = await supabase
    .from('pedidos')
    .select('id, cliente_nome, status, criado_em, pedido_itens(subtotal)')
    .eq('representante_id', userId)
    .gte('criado_em', inicioMes.toISOString());

  const { data: recentes } = await supabase
    .from('pedidos')
    .select('*')
    .eq('representante_id', userId)
    .order('criado_em', { ascending: false })
    .limit(3);

  const pedidos = (pedidosMes ?? []) as Array<{ id: string; pedido_itens: { subtotal: number }[] }>;
  const vendasTotais = pedidos.reduce(
    (acc, p) => acc + p.pedido_itens.reduce((s, i) => s + Number(i.subtotal), 0),
    0
  );
  const ticketMedio = pedidos.length > 0 ? vendasTotais / pedidos.length : 0;

  return (
    <div>
      <PageHeading
        title={`Olá, ${representante.nome.split(' ')[0]}! 👋`}
        subtitle="Veja o que está acontecendo com suas vendas hoje e tome ações rápidas."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-label uppercase text-on-surface-variant">Vendas Totais</p>
            <p className="mt-1 text-h1 text-primary">{formatCurrency(vendasTotais)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-label uppercase text-on-surface-variant">Pedidos Faturados</p>
            <p className="mt-1 text-h1 text-on-surface">{pedidos.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-label uppercase text-on-surface-variant">Ticket Médio</p>
            <p className="mt-1 text-h1 text-on-surface">{formatCurrency(ticketMedio)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="flex items-start gap-4 p-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary-fixed text-primary">
              <IconBox />
            </div>
            <div className="flex-1">
              <h2 className="text-h2 text-on-surface">Ver Produtos</h2>
              <p className="mt-1 text-body-sm text-on-surface-variant">
                Navegue pelo catálogo completo e grupos de produtos.
              </p>
              <Link
                href="/representante/produtos"
                className="mt-2 inline-flex items-center gap-1 text-body-sm font-medium text-primary hover:underline"
              >
                Explorar catálogo <IconArrowRight width={14} height={14} />
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-start gap-4 p-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-secondary-container/20 text-secondary">
              <IconClipboard />
            </div>
            <div className="flex-1">
              <h2 className="text-h2 text-on-surface">Meus Pedidos</h2>
              <p className="mt-1 text-body-sm text-on-surface-variant">
                Acompanhe o status e histórico de todas as suas vendas.
              </p>
              <Link
                href="/representante/pedidos"
                className="mt-2 inline-flex items-center gap-1 text-body-sm font-medium text-secondary hover:underline"
              >
                Ver histórico <IconArrowRight width={14} height={14} />
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-6">
          <h2 className="mb-4 text-h2 text-on-surface">Atividades Recentes</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-label uppercase text-on-surface-variant">
                  <th className="pb-3 pr-4 font-medium">Cliente</th>
                  <th className="pb-3 pr-4 font-medium">Data</th>
                  <th className="pb-3 pr-4 font-medium">Valor</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {(recentes as Pedido[] | null)?.map((pedido) => (
                  <tr key={pedido.id} className="border-t border-border-muted">
                    <td className="py-3 pr-4">
                      <p className="text-body font-medium text-on-surface">{pedido.cliente_nome}</p>
                      <p className="text-label text-on-surface-variant">
                        ID #{pedido.id.slice(0, 6)}
                      </p>
                    </td>
                    <td className="py-3 pr-4 text-body-sm text-on-surface-variant">
                      {formatDateTime(pedido.criado_em)}
                    </td>
                    <td className="py-3 pr-4 text-body font-medium text-on-surface">—</td>
                    <td className="py-3">
                      <StatusBadge status={pedido.status} />
                    </td>
                  </tr>
                ))}
                {(!recentes || recentes.length === 0) && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-body-sm text-on-surface-variant">
                      Nenhum pedido enviado ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
