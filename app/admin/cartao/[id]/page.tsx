import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRepresentante } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeading } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatCurrency, formatDate } from '@/lib/format';
import { IconDownload } from '@/components/ui/Icons';
import { BANCO_LABEL, ORIGEM_LABEL, TIPO_LABEL, type StatusLancamento } from '@/lib/cartao/rotulos';
import { StatusLancamentoBadge } from '../StatusLancamentoBadge';
import { desvincular, excluirFatura, marcarResolvido, reconciliarFatura, vincularManual } from '../actions';

interface Compra {
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
}

interface Lancamento {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  tipo: string;
  parcela_atual: number | null;
  parcela_total: number | null;
  cartao_final: string | null;
  status: StatusLancamento;
  vinculo: 'auto' | 'manual' | null;
  diferenca: number | null;
  observacao: string | null;
  cartao_compras: Compra | null;
}

const FILTROS: { value: string; label: string }[] = [
  { value: 'compras', label: 'Todas as compras' },
  { value: 'pendente', label: 'Sem compra' },
  { value: 'divergente', label: 'Divergentes' },
  { value: 'conciliado', label: 'Conciliadas' },
  { value: 'ignorado', label: 'Resolvidas' },
  { value: 'outros', label: 'Pagamentos, estornos e encargos' },
];

const DIA_MS = 86_400_000;

function dataCurta(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function valorEsperado(c: Compra, l: Lancamento): number {
  const parcelas = c.parcelas > 1 ? c.parcelas : l.parcela_total ?? 1;
  if (parcelas <= 1) return Number(c.valor_total);
  return c.parcelas > 1 && c.valor_parcela ? Number(c.valor_parcela) : Number(c.valor_total) / parcelas;
}

function DescricaoCompra({ compra }: { compra: Compra }) {
  return (
    <div className="min-w-0">
      <p className="text-body-sm font-medium text-on-surface">
        {ORIGEM_LABEL[compra.origem] ?? compra.origem}
        {compra.loja && compra.loja !== ORIGEM_LABEL[compra.origem] ? ` · ${compra.loja}` : ''}
      </p>
      <p className="max-w-72 truncate text-label text-on-surface-variant" title={compra.descricao ?? ''}>
        {dataCurta(compra.data)} · {formatCurrency(Number(compra.valor_total))}
        {compra.parcelas > 1 ? ` em ${compra.parcelas}x` : ''}
        {compra.descricao ? ` · ${compra.descricao}` : ''}
      </p>
    </div>
  );
}

export default async function FaturaPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { filtro?: string; nova?: string };
}) {
  await requireRepresentante('admin');
  const supabase = createClient();

  const [{ data: fatura }, { data: lancData }] = await Promise.all([
    supabase.from('cartao_faturas').select('*').eq('id', params.id).maybeSingle(),
    supabase
      .from('cartao_lancamentos')
      .select('*, cartao_compras(*)')
      .eq('fatura_id', params.id)
      .order('ordem'),
  ]);
  if (!fatura) notFound();
  const lancamentos = (lancData ?? []) as Lancamento[];
  const compras = lancamentos.filter((l) => l.tipo === 'compra');

  const filtro = searchParams.filtro ?? 'compras';
  const visiveis =
    filtro === 'outros'
      ? lancamentos.filter((l) => l.tipo !== 'compra')
      : filtro === 'compras'
        ? compras
        : compras.filter((l) => l.status === filtro);

  // candidatos para vínculo manual: compras do período ordenadas pela diferença de valor
  const abertos = visiveis.filter((l) => l.tipo === 'compra' && l.status !== 'conciliado' && l.status !== 'ignorado');
  const candidatosPorLanc = new Map<string, Compra[]>();
  if (abertos.length) {
    const datas = abertos.map((l) => l.data).sort();
    const inicio = new Date(Date.parse(datas[0]) - 400 * DIA_MS).toISOString().slice(0, 10);
    const fim = new Date(Date.parse(datas[datas.length - 1]) + 5 * DIA_MS).toISOString().slice(0, 10);
    const { data: periodo } = await supabase
      .from('cartao_compras')
      .select('*')
      .eq('usuario_id', fatura.criado_por)
      .gte('data', inicio)
      .lte('data', fim)
      .limit(2000);
    for (const l of abertos) {
      const candidatos = ((periodo ?? []) as Compra[])
        .map((c) => ({ c, diff: Math.abs(valorEsperado(c, l) - Number(l.valor)) }))
        .filter(({ diff }) => diff <= Math.max(5, Number(l.valor) * 0.3))
        .sort((a, b) => a.diff - b.diff)
        .slice(0, 8)
        .map(({ c }) => c);
      candidatosPorLanc.set(l.id, candidatos);
    }
  }

  const soma = (lista: Lancamento[]) => lista.reduce((s, l) => s + Number(l.valor), 0);
  const resumo: { status: StatusLancamento; itens: Lancamento[] }[] = (
    ['conciliado', 'divergente', 'pendente', 'ignorado'] as StatusLancamento[]
  ).map((status) => ({ status, itens: compras.filter((l) => l.status === status) }));
  const somaLida = soma(lancamentos.filter((l) => l.tipo !== 'pagamento'));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeading
          title={`Fatura ${BANCO_LABEL[fatura.banco] ?? fatura.banco}`}
          subtitle={`${fatura.vencimento ? `Vencimento ${formatDate(`${fatura.vencimento}T12:00:00`)} · ` : ''}${fatura.arquivo_nome}`}
        />
        <div className="flex gap-2">
          <a
            href={`/api/cartao/faturas/${fatura.id}/exportar`}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-primary px-3 text-body-sm font-medium text-primary hover:bg-primary/5"
          >
            <IconDownload width={16} height={16} /> Exportar Excel
          </a>
          <form action={reconciliarFatura}>
            <input type="hidden" name="faturaId" value={fatura.id} />
            <Button type="submit" variant="secondary" size="sm">
              Conciliar novamente
            </Button>
          </form>
          <form action={excluirFatura}>
            <input type="hidden" name="faturaId" value={fatura.id} />
            <Button type="submit" variant="ghost" size="sm">
              Excluir fatura
            </Button>
          </form>
        </div>
      </div>

      {searchParams.nova && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-5 py-4">
          <div>
            <p className="text-body font-semibold text-green-800">Fatura lida e conciliada</p>
            <p className="text-body-sm text-green-800">
              {compras.length} compra(s) na fatura: {resumo[0].itens.length} conciliada(s),{' '}
              {resumo[1].itens.length} divergente(s) e {resumo[2].itens.length} sem compra.
            </p>
          </div>
          <a
            href={`/api/cartao/faturas/${fatura.id}/exportar`}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-button text-on-primary hover:bg-primary/90"
          >
            <IconDownload width={16} height={16} /> Exportar Excel
          </a>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card className="p-4">
          <p className="text-label uppercase text-on-surface-variant">Total da fatura</p>
          <p className="mt-1 text-h2 text-on-surface">
            {fatura.total != null ? formatCurrency(Number(fatura.total)) : '—'}
          </p>
          <p className="mt-1 text-label text-on-surface-variant">Lido no PDF: {formatCurrency(somaLida)}</p>
        </Card>
        {resumo.map(({ status, itens }) => (
          <Card key={status} className="p-4">
            <div className="flex items-center justify-between">
              <StatusLancamentoBadge status={status} />
              <span className="text-body-sm text-on-surface-variant">{itens.length}</span>
            </div>
            <p className="mt-2 text-h2 text-on-surface">{formatCurrency(soma(itens))}</p>
          </Card>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <Link
            key={f.value}
            href={f.value === 'compras' ? `/admin/cartao/${fatura.id}` : `/admin/cartao/${fatura.id}?filtro=${f.value}`}
            className={`rounded-full px-3 py-1.5 text-body-sm font-medium ${
              filtro === f.value
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-container-low">
              <tr className="text-label uppercase text-on-surface-variant">
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Lançamento</th>
                <th className="px-4 py-3 text-right font-medium">Valor</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Compra no site</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l) => (
                <tr key={l.id} className="border-t border-border-muted align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-body-sm text-on-surface-variant">
                    {dataCurta(l.data)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-body text-on-surface">{l.descricao}</p>
                    <p className="text-label text-on-surface-variant">
                      {l.parcela_atual ? `Parcela ${l.parcela_atual}/${l.parcela_total}` : 'À vista'}
                      {l.cartao_final ? ` · final ${l.cartao_final}` : ''}
                      {l.tipo !== 'compra' ? ` · ${TIPO_LABEL[l.tipo]}` : ''}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-body font-medium text-on-surface">
                    {formatCurrency(Number(l.valor))}
                  </td>
                  <td className="px-4 py-3">
                    {l.tipo === 'compra' ? (
                      <>
                        <StatusLancamentoBadge status={l.status} />
                        {l.vinculo && (
                          <p className="mt-1 text-label text-on-surface-variant">
                            {l.vinculo === 'auto' ? 'automático' : 'manual'}
                          </p>
                        )}
                      </>
                    ) : (
                      <span className="text-body-sm text-on-surface-variant">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {l.tipo === 'compra' && (
                      <LinhaAcoes lancamento={l} candidatos={candidatosPorLanc.get(l.id) ?? []} />
                    )}
                  </td>
                </tr>
              ))}
              {visiveis.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-body-sm text-on-surface-variant">
                    Nenhum lançamento neste filtro.
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

function LinhaAcoes({ lancamento: l, candidatos }: { lancamento: Lancamento; candidatos: Compra[] }) {
  const desfazer = (
    <form action={desvincular}>
      <input type="hidden" name="lancamentoId" value={l.id} />
      <button type="submit" className="text-label font-medium text-on-surface-variant hover:text-error">
        Desfazer
      </button>
    </form>
  );

  if (l.status === 'conciliado' || l.status === 'divergente') {
    return (
      <div className="flex flex-col gap-1.5">
        {l.cartao_compras && <DescricaoCompra compra={l.cartao_compras} />}
        {l.status === 'divergente' && l.diferenca != null && (
          <p className="text-label font-medium text-amber-800">
            Diferença de {formatCurrency(Number(l.diferenca))} (frete, cupom ou juros?)
          </p>
        )}
        {l.observacao && <p className="text-label text-on-surface-variant">{l.observacao}</p>}
        <div className="flex gap-3">
          {l.status === 'divergente' && (
            <form action={marcarResolvido}>
              <input type="hidden" name="lancamentoId" value={l.id} />
              <input type="hidden" name="observacao" value={`Diferença de ${formatCurrency(Number(l.diferenca))} aceita`} />
              <button type="submit" className="text-label font-medium text-primary hover:underline">
                Aceitar diferença
              </button>
            </form>
          )}
          {desfazer}
        </div>
      </div>
    );
  }

  if (l.status === 'ignorado') {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-label text-on-surface-variant">{l.observacao ?? 'Resolvido sem compra vinculada.'}</p>
        {desfazer}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {candidatos.length > 0 ? (
        <form action={vincularManual} className="flex gap-2">
          <input type="hidden" name="lancamentoId" value={l.id} />
          <select
            name="compraId"
            required
            className="h-9 max-w-72 rounded-md border border-[#D1D5DB] bg-surface-container-lowest px-2 text-body-sm text-on-surface"
          >
            <option value="">Vincular a uma compra…</option>
            {candidatos.map((c) => (
              <option key={c.id} value={c.id}>
                {dataCurta(c.data)} · {ORIGEM_LABEL[c.origem] ?? c.origem} · {formatCurrency(Number(c.valor_total))}
                {c.parcelas > 1 ? ` (${c.parcelas}x)` : ''} · {(c.descricao ?? c.loja ?? '').slice(0, 40)}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" variant="secondary">
            Vincular
          </Button>
        </form>
      ) : (
        <p className="text-label text-on-surface-variant">
          Nenhuma compra com valor parecido.{' '}
          <Link href="/admin/cartao/compras" className="font-medium text-primary hover:underline">
            Cadastrar compra
          </Link>
        </p>
      )}
      <form action={marcarResolvido} className="flex gap-2">
        <input type="hidden" name="lancamentoId" value={l.id} />
        <input
          name="observacao"
          placeholder="Motivo (ex.: assinatura, compra em loja física)"
          className="h-8 w-64 rounded-md border border-[#D1D5DB] bg-surface-container-lowest px-2 text-label text-on-surface placeholder:text-outline"
        />
        <button type="submit" className="text-label font-medium text-on-surface-variant hover:text-primary">
          Resolver sem compra
        </button>
      </form>
    </div>
  );
}
