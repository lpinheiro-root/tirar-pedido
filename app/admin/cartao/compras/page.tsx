import Link from 'next/link';
import { requireRepresentante } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeading } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/format';
import { IconDownload } from '@/components/ui/Icons';
import { ORIGEM_LABEL } from '@/lib/cartao/rotulos';
import { mesAtual, rotuloMes, situacaoNoMes, textoSituacao } from '@/lib/cartao/parcelas';
import { excluirCompra } from '../actions';
import { ImportarComprasForm, NovaCompraForm } from './ComprasForms';
import { NotaFiscalCelula } from './NotaFiscalCelula';

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
  valor_parcela: number | null;
  fonte: string;
  usuario_id: string;
  faturamento: 'cpf' | 'cnpj' | null;
  faturamento_cnpj: string | null;
  cartao_lancamentos: {
    id: string;
    fatura_id: string;
    parcela_atual: number | null;
    cartao_faturas: { vencimento: string | null } | null;
  }[];
  cartao_notas: { id: string; situacao: string }[];
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

export default async function ComprasPage({
  searchParams,
}: {
  searchParams: { origem?: string; mes?: string; so_mes?: string };
}) {
  const { representante } = await requireRepresentante('admin');
  const supabase = createClient();
  const origem = searchParams.origem ?? 'todas';
  const mes = /^\d{4}-\d{2}$/.test(searchParams.mes ?? '') ? searchParams.mes! : mesAtual();
  const soMes = searchParams.so_mes === '1';

  const link = (params: { origem?: string; so_mes?: boolean }) => {
    const q = new URLSearchParams();
    const o = params.origem ?? origem;
    if (o !== 'todas') q.set('origem', o);
    if (mes !== mesAtual()) q.set('mes', mes);
    if (params.so_mes ?? soMes) q.set('so_mes', '1');
    const s = q.toString();
    return s ? `?${s}` : '';
  };

  let query = supabase
    .from('cartao_compras')
    .select('*, cartao_lancamentos(id, fatura_id, parcela_atual, cartao_faturas(vencimento)), cartao_notas(id, situacao)')
    .order('data', { ascending: false })
    .limit(500);
  if (origem !== 'todas') query = query.eq('origem', origem);
  const { data } = await query;
  const todas = ((data ?? []) as CompraLista[]).map((c) => ({
    ...c,
    situacao: situacaoNoMes(
      c,
      mes,
      c.cartao_lancamentos.map((l) => ({ parcela_atual: l.parcela_atual, vencimento: l.cartao_faturas?.vencimento ?? null }))
    ),
  }));
  const noMes = todas.filter((c) => c.situacao.estado === 'no_mes');
  const compras = soMes ? noMes : todas;
  const totalMes = noMes.reduce((s, c) => s + c.situacao.valorMes, 0);
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

      <Card className="mb-4 flex flex-wrap items-center justify-between gap-4 p-4">
        <form className="flex flex-wrap items-end gap-3">
          {origem !== 'todas' && <input type="hidden" name="origem" value={origem} />}
          {soMes && <input type="hidden" name="so_mes" value="1" />}
          <div>
            <label className="mb-1 block text-label text-on-surface-variant">Fatura com vencimento em</label>
            <input
              type="month"
              name="mes"
              defaultValue={mes}
              className="h-9 rounded-md border border-[#D1D5DB] bg-surface-container-lowest px-2 text-body-sm text-on-surface"
            />
          </div>
          <button
            type="submit"
            className="h-9 rounded-md bg-primary px-3 text-body-sm font-medium text-on-primary hover:bg-primary/90"
          >
            Ver mês
          </button>
        </form>
        <div className="text-right">
          <p className="text-label uppercase text-on-surface-variant">Parcelas em {rotuloMes(mes)}</p>
          <p className="text-h2 text-on-surface">{formatCurrency(totalMes)}</p>
          <p className="text-label text-on-surface-variant">{noMes.length} compra(s) com parcela no mês</p>
        </div>
      </Card>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {['todas', ...Object.keys(ORIGEM_LABEL)].map((o) => (
            <Link
              key={o}
              href={`/admin/cartao/compras${link({ origem: o })}`}
              className={`rounded-full px-3 py-1.5 text-body-sm font-medium ${
                origem === o
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              {o === 'todas' ? 'Todas' : ORIGEM_LABEL[o]}
            </Link>
          ))}
          <Link
            href={`/admin/cartao/compras${link({ so_mes: !soMes })}`}
            className={`rounded-full border px-3 py-1.5 text-body-sm font-medium ${
              soMes
                ? 'border-primary bg-primary-fixed text-primary'
                : 'border-border-muted text-on-surface-variant hover:bg-surface-container-low'
            }`}
          >
            {soMes ? '✓ ' : ''}Só com parcela em {rotuloMes(mes)}
          </Link>
        </div>
        <a
          href={`/api/cartao/compras/exportar?${new URLSearchParams({ origem, mes, ...(soMes ? { so_mes: '1' } : {}) })}`}
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
                <th className="px-4 py-3 font-medium">Parcela em {rotuloMes(mes)}</th>
                <th className="px-4 py-3 font-medium">Na fatura</th>
                <th className="px-4 py-3 font-medium">Nota fiscal</th>
                <th className="px-4 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {compras.map((c) => {
                const encontradas = c.cartao_lancamentos.length;
                const s = c.situacao;
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
                          {c.parcelas}x de{' '}
                          {formatCurrency(Number(c.valor_parcela ?? Number(c.valor_total) / c.parcelas))}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <p
                        className={`text-body-sm font-medium ${
                          s.estado === 'no_mes' ? 'text-on-surface' : 'text-on-surface-variant'
                        }`}
                      >
                        {textoSituacao(s)}
                      </p>
                      {s.estado === 'no_mes' && (
                        <p className="text-label text-on-surface-variant">
                          {formatCurrency(s.valorMes)}
                          {' · '}
                          <span className={s.confirmado ? 'text-green-700' : ''}>
                            {s.confirmado ? 'confirmado na fatura' : 'estimado'}
                          </span>
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {encontradas === 0 ? (
                        <span className="whitespace-nowrap text-body-sm text-on-surface-variant">Não localizada</span>
                      ) : (
                        <Link
                          href={`/admin/cartao/${c.cartao_lancamentos[0].fatura_id}`}
                          className="text-body-sm font-medium text-green-700 hover:underline"
                        >
                          {c.parcelas > 1 ? `${encontradas}/${c.parcelas} parcelas` : 'Conciliada'}
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <NotaFiscalCelula
                        notas={c.cartao_notas}
                        faturamento={c.faturamento}
                        faturamentoCnpj={c.faturamento_cnpj}
                        data={c.data}
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
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
                  <td colSpan={8} className="px-4 py-8 text-center text-body-sm text-on-surface-variant">
                    {soMes ? `Nenhuma parcela vence em ${rotuloMes(mes)}.` : 'Nenhuma compra registrada.'}
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
