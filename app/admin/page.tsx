import { requireRepresentante } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeading } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { formatCurrency, formatDateTime } from '@/lib/format';
import type { Pedido, Representante } from '@/types';

export default async function AdminOverviewPage() {
  await requireRepresentante('admin');
  const supabase = createClient();

  const trintaDiasAtras = new Date();
  trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

  const [{ data: pedidos }, { data: representantes }] = await Promise.all([
    supabase
      .from('pedidos')
      .select('*, pedido_itens(subtotal), representantes(nome)')
      .gte('criado_em', trintaDiasAtras.toISOString())
      .order('criado_em', { ascending: false }),
    supabase.from('representantes').select('*'),
  ]);

  const listaPedidos = (pedidos ?? []) as Array<
    Pedido & { pedido_itens: { subtotal: number }[]; representantes: { nome: string } | null }
  >;
  const listaRepresentantes = (representantes ?? []) as Representante[];

  const receita = listaPedidos.reduce(
    (acc, p) => acc + p.pedido_itens.reduce((s, i) => s + Number(i.subtotal), 0),
    0
  );
  const repsAtivos = listaRepresentantes.filter((r) => r.ativo).length;

  const porEstado = new Map<string, number>();
  for (const p of listaPedidos) {
    const rep = listaRepresentantes.find((r) => r.id === p.representante_id);
    if (!rep) continue;
    porEstado.set(rep.estado, (porEstado.get(rep.estado) ?? 0) + 1);
  }
  const maxEstado = Math.max(1, ...porEstado.values());

  const porRepresentante = new Map<string, { nome: string; total: number }>();
  for (const p of listaPedidos) {
    const valor = p.pedido_itens.reduce((s, i) => s + Number(i.subtotal), 0);
    const nome = p.representantes?.nome ?? 'Desconhecido';
    const atual = porRepresentante.get(p.representante_id) ?? { nome, total: 0 };
    atual.total += valor;
    porRepresentante.set(p.representante_id, atual);
  }
  const topRepresentantes = Array.from(porRepresentante.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
  const maxRepresentante = Math.max(1, ...topRepresentantes.map((r) => r.total));

  return (
    <div>
      <PageHeading title="Admin Overview" subtitle="Performance tracking para todos os territórios operacionais." />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-label uppercase text-on-surface-variant">Total de Pedidos</p>
            <p className="mt-1 text-h1 text-on-surface">{listaPedidos.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-label uppercase text-on-surface-variant">Receita (30 dias)</p>
            <p className="mt-1 text-h1 text-primary">{formatCurrency(receita)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-label uppercase text-on-surface-variant">Representantes Ativos</p>
            <p className="mt-1 text-h1 text-on-surface">
              {repsAtivos}{' '}
              <span className="text-body-sm font-normal text-on-surface-variant">
                de {listaRepresentantes.length}
              </span>
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-4 text-h2 text-on-surface">Pedidos por Estado</h2>
            <div className="flex flex-col gap-3">
              {Array.from(porEstado.entries()).map(([estado, total]) => (
                <div key={estado}>
                  <div className="mb-1 flex justify-between text-body-sm text-on-surface-variant">
                    <span>{estado}</span>
                    <span>{total}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-low">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(total / maxEstado) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
              {porEstado.size === 0 && (
                <p className="text-body-sm text-on-surface-variant">Sem pedidos no período.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h2 className="mb-4 text-h2 text-on-surface">Top Representantes</h2>
            <div className="flex flex-col gap-3">
              {topRepresentantes.map((rep) => (
                <div key={rep.nome}>
                  <div className="mb-1 flex justify-between text-body-sm text-on-surface-variant">
                    <span>{rep.nome}</span>
                    <span>{formatCurrency(rep.total)}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-low">
                    <div
                      className="h-full rounded-full bg-secondary"
                      style={{ width: `${(rep.total / maxRepresentante) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
              {topRepresentantes.length === 0 && (
                <p className="text-body-sm text-on-surface-variant">Sem pedidos no período.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-6">
          <h2 className="mb-4 text-h2 text-on-surface">Histórico Global de Pedidos</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-label uppercase text-on-surface-variant">
                  <th className="pb-3 pr-4 font-medium">Pedido</th>
                  <th className="pb-3 pr-4 font-medium">Representante</th>
                  <th className="pb-3 pr-4 font-medium">Cliente</th>
                  <th className="pb-3 pr-4 font-medium">Data</th>
                  <th className="pb-3 pr-4 font-medium">Valor</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {listaPedidos.slice(0, 10).map((pedido) => {
                  const valor = pedido.pedido_itens.reduce((s, i) => s + Number(i.subtotal), 0);
                  return (
                    <tr key={pedido.id} className="border-t border-border-muted">
                      <td className="py-3 pr-4 text-body-sm text-on-surface-variant">
                        #{pedido.id.slice(0, 6)}
                      </td>
                      <td className="py-3 pr-4 text-body text-on-surface">
                        {pedido.representantes?.nome ?? '—'}
                      </td>
                      <td className="py-3 pr-4 text-body text-on-surface">{pedido.cliente_nome}</td>
                      <td className="py-3 pr-4 text-body-sm text-on-surface-variant">
                        {formatDateTime(pedido.criado_em)}
                      </td>
                      <td className="py-3 pr-4 text-body font-medium text-on-surface">
                        {formatCurrency(valor)}
                      </td>
                      <td className="py-3">
                        <StatusBadge status={pedido.status} />
                      </td>
                    </tr>
                  );
                })}
                {listaPedidos.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-body-sm text-on-surface-variant">
                      Nenhum pedido nos últimos 30 dias.
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
