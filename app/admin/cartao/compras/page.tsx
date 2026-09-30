import Link from 'next/link';
import { requireRepresentante } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeading } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/format';
import { IconDownload } from '@/components/ui/Icons';
import { ORIGEM_LABEL } from '@/lib/cartao/rotulos';
import { excluirCompra } from '../actions';
import { ImportarComprasForm, NovaCompraForm } from './ComprasForms';

interface CompraLista {
  id: string;
  origem: string;
  conta: string | null;
  pedido_externo: string | null;
  data: string;
  loja: string | null;
  descricao: string | null;
  valor_total: number;
  parcelas: number;
  fonte: string;
  usuario_id: string;
  cartao_lancamentos: { id: string; fatura_id: string }[];
}

const FONTE_LABEL: Record<string, string> = { api: 'API', importacao: 'Planilha', manual: 'Manual' };


/** Para o super admin: nome de quem é dono de cada registro. */
async function nomesDosDonos(supabase: ReturnType<typeof createClient>, ids: string[]) {
  const nomes = new Map<string, string>();
  if (!ids.length) return nomes;
  const { data } = await supabase.from('representantes').select('id, nome').in('id', Array.from(new Set(ids)));
  for (const u of data ?? []) nomes.set(u.id, u.nome);
  return nomes;
}

export default async function ComprasPage({ searchParams }: { searchParams: { origem?: string } }) {
  const { representante } = await requireRepresentante('admin');
  const supabase = createClient();
  const origem = searchParams.origem ?? 'todas';

  let query = supabase
    .from('cartao_compras')
    .select('*, cartao_lancamentos(id, fatura_id)')
    .order('data', { ascending: false })
    .limit(300);
  if (origem !== 'todas') query = query.eq('origem', origem);
  const { data } = await query;
  const compras = (data ?? []) as CompraLista[];
  const donos = representante.super_admin
    ? await nomesDosDonos(supabase, compras.map((c) => c.usuario_id))
    : null;

  return (
    <div>
      <PageHeading
        title="Compras nos sites"
        subtitle="Mercado Livre entra pela integração; Shopee, Magalu e outros por planilha ou cadastro manual."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Importar planilha</CardTitle>
          </CardHeader>
          <CardContent>
            <ImportarComprasForm />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Cadastrar compra</CardTitle>
          </CardHeader>
          <CardContent>
            <NovaCompraForm />
          </CardContent>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {['todas', ...Object.keys(ORIGEM_LABEL)].map((o) => (
            <Link
              key={o}
              href={o === 'todas' ? '/admin/cartao/compras' : `/admin/cartao/compras?origem=${o}`}
              className={`rounded-full px-3 py-1.5 text-body-sm font-medium ${
                origem === o
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              {o === 'todas' ? 'Todas' : ORIGEM_LABEL[o]}
            </Link>
          ))}
        </div>
        <a
          href={`/api/cartao/compras/exportar?origem=${origem}`}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-primary px-3 text-body-sm font-medium text-primary hover:bg-primary/5"
        >
          <IconDownload width={16} height={16} /> Exportar Excel
        </a>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-container-low">
              <tr className="text-label uppercase text-on-surface-variant">
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Site</th>
                <th className="px-4 py-3 font-medium">Compra</th>
                <th className="px-4 py-3 text-right font-medium">Valor</th>
                <th className="px-4 py-3 font-medium">Na fatura</th>
                <th className="px-4 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {compras.map((c) => {
                const encontradas = c.cartao_lancamentos.length;
                return (
                  <tr key={c.id} className="border-t border-border-muted align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-body-sm text-on-surface-variant">
                      {new Date(`${c.data}T12:00:00`).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-body-sm font-medium text-on-surface">{ORIGEM_LABEL[c.origem] ?? c.origem}</p>
                      <p className="text-label text-on-surface-variant">
                        {FONTE_LABEL[c.fonte]}
                        {c.conta ? ` · ${c.conta}` : ''}
                      </p>
                      {donos && (
                        <p className="text-label text-on-surface-variant">{donos.get(c.usuario_id) ?? '—'}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="max-w-md truncate text-body text-on-surface" title={c.descricao ?? ''}>
                        {c.descricao ?? c.loja ?? '—'}
                      </p>
                      <p className="text-label text-on-surface-variant">
                        {c.loja && c.descricao ? `${c.loja} · ` : ''}
                        {c.pedido_externo ? `Pedido ${c.pedido_externo.replace(/^pagamento:/, 'pgto ')}` : ''}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <p className="text-body font-medium text-on-surface">{formatCurrency(Number(c.valor_total))}</p>
                      {c.parcelas > 1 && (
                        <p className="text-label text-on-surface-variant">
                          {c.parcelas}x de {formatCurrency(Number(c.valor_total) / c.parcelas)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {encontradas === 0 ? (
                        <span className="text-body-sm text-on-surface-variant">Não localizada</span>
                      ) : (
                        <Link
                          href={`/admin/cartao/${c.cartao_lancamentos[0].fatura_id}`}
                          className="text-body-sm font-medium text-green-700 hover:underline"
                        >
                          {c.parcelas > 1 ? `${encontradas}/${c.parcelas} parcelas` : 'Conciliada'}
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <form action={excluirCompra}>
                        <input type="hidden" name="compraId" value={c.id} />
                        <button type="submit" className="text-label font-medium text-on-surface-variant hover:text-error">
                          Excluir
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
              {compras.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-body-sm text-on-surface-variant">
                    Nenhuma compra registrada.
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
