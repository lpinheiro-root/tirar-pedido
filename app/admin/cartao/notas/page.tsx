import Link from 'next/link';
import { requireRepresentante } from '@/lib/auth';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { PageHeading } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { IconDownload } from '@/components/ui/Icons';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { ORIGEM_LABEL } from '@/lib/cartao/rotulos';
import { lerConfigNFe } from '@/lib/cartao/nfe';

interface NotaLista {
  id: string;
  chave: string;
  nome_emitente: string | null;
  cnpj_emitente: string | null;
  data_emissao: string | null;
  valor_total: number | null;
  situacao: 'resumo' | 'completa' | 'cancelada';
  ciencia_em: string | null;
  ciencia_status: string | null;
  compra_id: string | null;
  cartao_compras: { descricao: string | null; loja: string | null; origem: string; data: string } | null;
}

const SITUACAO: Record<NotaLista['situacao'], { label: string; classe: string }> = {
  completa: { label: 'XML disponível', classe: 'bg-green-100 text-green-700' },
  resumo: { label: 'Aguardando XML', classe: 'bg-amber-100 text-amber-800' },
  cancelada: { label: 'Cancelada', classe: 'bg-error-container text-error-on-container' },
};

function cnpjFormatado(c: string | null) {
  return c && c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c ?? '';
}

export default async function NotasPage({ searchParams }: { searchParams: { filtro?: string } }) {
  const { representante } = await requireRepresentante('admin');
  const superAdmin = Boolean(representante.super_admin);
  const supabase = createClient();
  const filtro = superAdmin ? searchParams.filtro ?? 'compras' : 'compras';

  let query = supabase
    .from('cartao_notas')
    .select(
      'id, chave, nome_emitente, cnpj_emitente, data_emissao, valor_total, situacao, ciencia_em, ciencia_status, compra_id, cartao_compras(descricao, loja, origem, data)'
    )
    .order('data_emissao', { ascending: false })
    .limit(300);
  if (filtro === 'compras') query = query.not('compra_id', 'is', null);
  if (filtro === 'sem_compra') query = query.is('compra_id', null);
  const { data } = await query;
  const notas = (data ?? []) as unknown as NotaLista[];

  // status gravado pelo robô de notas (ferramentas/notas-alterdata) a cada rodada
  const robo = superAdmin ? await lerConfigNFe(createServiceRoleClient()) : null;
  const roboAtrasado = !robo?.ultima_consulta || Date.now() - Date.parse(robo.ultima_consulta) > 2 * 3_600_000;

  return (
    <div>
      <PageHeading
        title="Notas fiscais"
        subtitle="NF-e recebidas pela Biosense, Veneza e Roma, trazidas do Alterdata (NF-Stock) e vinculadas às compras."
      />

      {superAdmin && (
        <Card className="mb-6 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-h2 text-on-surface">Robô de notas (Alterdata)</p>
              <p className="mt-1 text-body-sm text-on-surface-variant">
                Roda a cada 30 minutos no servidor interno e envia as notas novas destinadas às empresas.
              </p>
            </div>
            <span
              className={`inline-flex rounded-sm px-2 py-1 text-label font-medium ${
                roboAtrasado ? 'bg-error-container text-error-on-container' : 'bg-green-100 text-green-700'
              }`}
            >
              {roboAtrasado ? 'Sem rodar há mais de 2h' : 'Funcionando'}
            </span>
          </div>
          <p className="mt-3 text-body-sm text-on-surface-variant">
            Última rodada: {robo?.ultima_consulta ? formatDateTime(robo.ultima_consulta) : 'nunca'}
          </p>
          {robo?.ultimo_status && <p className="text-label text-on-surface-variant">{robo.ultimo_status}</p>}
        </Card>
      )}

      {superAdmin && (
        <div className="mb-4 flex flex-wrap gap-2">
          {[
            { value: 'compras', label: 'Vinculadas a compras' },
            { value: 'sem_compra', label: 'Sem compra' },
            { value: 'todas', label: 'Todas do CNPJ' },
          ].map((f) => (
            <Link
              key={f.value}
              href={f.value === 'compras' ? '/admin/cartao/notas' : `/admin/cartao/notas?filtro=${f.value}`}
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
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-container-low">
              <tr className="text-label uppercase text-on-surface-variant">
                <th className="px-4 py-3 font-medium">Emissão</th>
                <th className="px-4 py-3 font-medium">Emitente</th>
                <th className="px-4 py-3 text-right font-medium">Valor</th>
                <th className="px-4 py-3 font-medium">Situação</th>
                <th className="px-4 py-3 font-medium">Compra</th>
                <th className="px-4 py-3 text-right font-medium">Baixar</th>
              </tr>
            </thead>
            <tbody>
              {notas.map((n) => (
                <tr key={n.id} className="border-t border-border-muted align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-body-sm text-on-surface-variant">
                    {n.data_emissao ? new Date(n.data_emissao).toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-body text-on-surface">{n.nome_emitente}</p>
                    <p className="text-label text-on-surface-variant">{cnpjFormatado(n.cnpj_emitente)}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-body font-medium text-on-surface">
                    {n.valor_total != null ? formatCurrency(Number(n.valor_total)) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex whitespace-nowrap rounded-sm px-2 py-1 text-label font-medium ${SITUACAO[n.situacao].classe}`}
                    >
                      {SITUACAO[n.situacao].label}
                    </span>
                    {n.situacao === 'resumo' && n.ciencia_status && !n.ciencia_em && (
                      <p className="mt-1 max-w-48 text-label text-error">{n.ciencia_status}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {n.cartao_compras ? (
                      <>
                        <p className="max-w-72 truncate text-body-sm text-on-surface" title={n.cartao_compras.descricao ?? ''}>
                          {n.cartao_compras.descricao ?? n.cartao_compras.loja ?? '—'}
                        </p>
                        <p className="text-label text-on-surface-variant">
                          {ORIGEM_LABEL[n.cartao_compras.origem] ?? n.cartao_compras.origem} ·{' '}
                          {new Date(`${n.cartao_compras.data}T12:00:00`).toLocaleDateString('pt-BR')}
                        </p>
                      </>
                    ) : (
                      <span className="text-body-sm text-on-surface-variant">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {n.situacao === 'completa' ? (
                      <div className="flex justify-end gap-3">
                        <a
                          href={`/api/cartao/notas/${n.id}/pdf`}
                          className="inline-flex items-center gap-1 text-body-sm font-medium text-primary hover:underline"
                        >
                          <IconDownload width={14} height={14} /> PDF
                        </a>
                        <Link
                          href={`/admin/cartao/notas/${n.id}/danfe`}
                          className="text-body-sm font-medium text-primary hover:underline"
                        >
                          DANFE
                        </Link>
                        <a
                          href={`/api/cartao/notas/${n.id}/xml`}
                          className="inline-flex items-center gap-1 text-body-sm font-medium text-primary hover:underline"
                        >
                          <IconDownload width={14} height={14} /> XML
                        </a>
                      </div>
                    ) : (
                      <span className="text-label text-on-surface-variant">em breve</span>
                    )}
                  </td>
                </tr>
              ))}
              {notas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-body-sm text-on-surface-variant">
                    Nenhuma nota fiscal {filtro === 'compras' ? 'vinculada às suas compras ' : ''}ainda.
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
