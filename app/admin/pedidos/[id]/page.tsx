import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRepresentante } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeading } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { IconChevronLeft, IconDownload } from '@/components/ui/Icons';
import { DownloadExcelButton } from './DownloadExcelButton';

export default async function AdminPedidoDetalhePage({ params }: { params: { id: string } }) {
  await requireRepresentante('admin');
  const supabase = createClient();

  const { data: pedido } = await supabase
    .from('pedidos')
    .select('*, representantes(nome, email), pedido_itens(*)')
    .eq('id', params.id)
    .single();

  if (!pedido) notFound();

  const itens = pedido.pedido_itens as Array<{
    id: string;
    produto_nome: string;
    quantidade: number;
    preco_unitario: number;
    subtotal: number;
  }>;
  const total = itens.reduce((acc, i) => acc + Number(i.subtotal), 0);

  return (
    <div>
      <Link
        href="/admin/pedidos"
        className="mb-4 inline-flex items-center gap-1 text-body-sm text-on-surface-variant hover:text-primary"
      >
        <IconChevronLeft width={16} height={16} /> Voltar aos pedidos
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4">
        <PageHeading
          title={`Pedido #${pedido.id.slice(0, 8)}`}
          subtitle={`${pedido.cliente_nome} · ${formatDateTime(pedido.criado_em)}`}
        />
        <StatusBadge status={pedido.status} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="p-5">
          <p className="text-label uppercase text-on-surface-variant">Representante</p>
          <p className="mt-1 text-body font-medium text-on-surface">
            {pedido.representantes?.nome ?? '—'}
          </p>
          <p className="text-body-sm text-on-surface-variant">{pedido.representantes?.email}</p>
        </Card>
        <Card className="p-5">
          <p className="text-label uppercase text-on-surface-variant">Notificações</p>
          <p className="mt-1 text-body-sm text-on-surface">
            E-mail: {pedido.enviado_email ? 'Enviado ✓' : 'Não enviado'}
          </p>
          <p className="text-body-sm text-on-surface">
            WhatsApp: {pedido.enviado_whatsapp ? 'Enviado ✓' : 'Não enviado'}
          </p>
        </Card>
        <Card className="flex flex-col justify-between p-5">
          <div>
            <p className="text-label uppercase text-on-surface-variant">Total do Pedido</p>
            <p className="mt-1 text-h1 text-primary">{formatCurrency(total)}</p>
          </div>
          {pedido.excel_url && (
            <DownloadExcelButton pedidoId={pedido.id}>
              <IconDownload width={16} height={16} /> Baixar Excel
            </DownloadExcelButton>
          )}
        </Card>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-container-low">
              <tr className="text-label uppercase text-on-surface-variant">
                <th className="px-4 py-3 font-medium">Produto</th>
                <th className="px-4 py-3 font-medium">Quantidade</th>
                <th className="px-4 py-3 font-medium">Preço Unitário</th>
                <th className="px-4 py-3 font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <tr key={item.id} className="border-t border-border-muted">
                  <td className="px-4 py-3 text-body text-on-surface">{item.produto_nome}</td>
                  <td className="px-4 py-3 text-body-sm text-on-surface-variant">{item.quantidade}</td>
                  <td className="px-4 py-3 text-body-sm text-on-surface-variant">
                    {formatCurrency(Number(item.preco_unitario))}
                  </td>
                  <td className="px-4 py-3 text-body font-medium text-on-surface">
                    {formatCurrency(Number(item.subtotal))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
