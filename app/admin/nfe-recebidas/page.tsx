import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/auth';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { PageHeading } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { IconDownload } from '@/components/ui/Icons';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { formatarCnpj, nomeCurtoEmpresa } from '@/lib/empresas';
import { aplicarFiltros, filtrosParaUrl, lerFiltros } from '@/lib/nfeRecebidas';
import { lerConfigNFe } from '@/lib/cartao/nfe';
import { ORIGEM_LABEL } from '@/lib/cartao/rotulos';
import { buscarTodas } from '@/lib/supabasePaginado';

const POR_PAGINA = 100;

interface NotaLinha {
  id: string;
  chave: string;
  nome_emitente: string | null;
  cnpj_emitente: string | null;
  cnpj_destinatario: string | null;
  nome_destinatario: string | null;
  data_emissao: string | null;
  valor_total: number | null;
  situacao: 'resumo' | 'completa' | 'cancelada';
  cartao_compras: { descricao: string | null; origem: string; data: string } | null;
}

const campoClasse =
  'h-9 rounded-md border border-[#D1D5DB] bg-surface-container-lowest px-2 text-body-sm text-on-surface';

export default async function NfeRecebidasPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  await requireSuperAdmin();
  const supabase = createClient();
  const filtros = lerFiltros(searchParams);
  const pagina = Math.max(1, Number(searchParams.pagina) || 1);

  const [{ data, count }, valores, robo, { data: destinatarios }, { data: maisRecente }] = await Promise.all([
    aplicarFiltros(
      supabase
        .from('cartao_notas')
        .select(
          'id, chave, nome_emitente, cnpj_emitente, cnpj_destinatario, nome_destinatario, data_emissao, valor_total, situacao, cartao_compras(descricao, origem, data)',
          { count: 'exact' }
        ),
      filtros
    )
      .order('data_emissao', { ascending: false })
      .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1),
    // soma de todas as notas do filtro (o Supabase devolve no máximo 1.000 por consulta)
    buscarTodas<{ valor_total: number | null }>((de, ate) =>
      aplicarFiltros(supabase.from('cartao_notas').select('valor_total').neq('situacao', 'cancelada'), filtros)
        .order('id')
        .range(de, ate)
    ),
    lerConfigNFe(createServiceRoleClient()),
    supabase.from('nfe_destinatarios').select('cnpj, nome, notas').order('nome'),
    // emissão mais recente que já chegou (mostra o atraso da importação diária do Alterdata)
    supabase
      .from('cartao_notas')
      .select('data_emissao')
      .not('cnpj_destinatario', 'is', null)
      .order('data_emissao', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const empresas = (destinatarios ?? []) as { cnpj: string; nome: string | null; notas: number }[];
  const nomeEmpresa = (cnpj: string | null, nome?: string | null) =>
    cnpj ? nomeCurtoEmpresa(cnpj, empresas.find((e) => e.cnpj === cnpj)?.nome ?? nome) : '—';
  const notas = (data ?? []) as unknown as NotaLinha[];
  const total = count ?? 0;
  const soma = (valores ?? []).reduce((s, v) => s + Number(v.valor_total ?? 0), 0);
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <div>
      <PageHeading
        title="NF-e Recebidas"
        subtitle="Notas fiscais emitidas contra as empresas cadastradas no NF-Stock, trazidas do Alterdata."
      />

      <Card className="mb-4 p-4">
        <form className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-label text-on-surface-variant">Empresa</label>
            <select name="empresa" defaultValue={filtros.empresa} className={campoClasse}>
              <option value="">Todas</option>
              {empresas.map((e) => (
                <option key={e.cnpj} value={e.cnpj}>
                  {nomeEmpresa(e.cnpj, e.nome)} ({e.notas})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-label text-on-surface-variant">Mês de emissão</label>
            <input type="month" name="mes" defaultValue={filtros.mes} className={campoClasse} />
          </div>
          <div className="min-w-56 flex-1">
            <label className="mb-1 block text-label text-on-surface-variant">Emitente (nome ou CNPJ)</label>
            <input
              name="busca"
              defaultValue={filtros.busca}
              placeholder="Ex.: Loja Exemplo ou 11.222.333"
              className={`${campoClasse} w-full`}
            />
          </div>
          <div>
            <label className="mb-1 block text-label text-on-surface-variant">Compra do cartão</label>
            <select name="vinculo" defaultValue={filtros.vinculo} className={campoClasse}>
              <option value="">Todas</option>
              <option value="com">Ligadas a compra</option>
              <option value="sem">Sem compra</option>
            </select>
          </div>
          <button type="submit" className="h-9 rounded-md bg-primary px-4 text-body-sm font-medium text-on-primary hover:bg-primary/90">
            Filtrar
          </button>
          <Link href="/admin/nfe-recebidas" className="h-9 px-2 text-body-sm leading-9 text-on-surface-variant hover:text-primary">
            Limpar
          </Link>
        </form>
      </Card>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-6">
          <div>
            <p className="text-label uppercase text-on-surface-variant">Notas</p>
            <p className="text-h2 text-on-surface">{total.toLocaleString('pt-BR')}</p>
          </div>
          <div>
            <p className="text-label uppercase text-on-surface-variant">Valor total</p>
            <p className="text-h2 text-on-surface">{formatCurrency(soma)}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right text-label text-on-surface-variant">
            <p>
              Notas até:{' '}
              <span className="font-medium text-on-surface">
                {maisRecente?.data_emissao
                  ? new Date(maisRecente.data_emissao).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
                  : '—'}
              </span>{' '}
              (o Alterdata importa do NF-Stock 1x por dia)
            </p>
            <p>
              Robô: {robo?.ultima_consulta ? `última leitura ${formatDateTime(robo.ultima_consulta)}` : 'ainda não rodou'}
            </p>
          </div>
          <a
            href={`/api/nfe-recebidas/exportar${filtrosParaUrl(filtros)}`}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-primary px-3 text-body-sm font-medium text-primary hover:bg-primary/5"
          >
            <IconDownload width={16} height={16} /> Exportar Excel
          </a>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-container-low">
              <tr className="text-label uppercase text-on-surface-variant">
                <th className="px-4 py-3 font-medium">Emissão</th>
                <th className="px-4 py-3 font-medium">Nº / Série</th>
                <th className="px-4 py-3 font-medium">Emitente</th>
                <th className="px-4 py-3 font-medium">Empresa</th>
                <th className="px-4 py-3 text-right font-medium">Valor</th>
                <th className="px-4 py-3 font-medium">Compra do cartão</th>
                <th className="px-4 py-3 text-right font-medium">Baixar</th>
              </tr>
            </thead>
            <tbody>
              {notas.map((n) => (
                <tr key={n.id} className="border-t border-border-muted align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-body-sm text-on-surface-variant">
                    {n.data_emissao ? new Date(n.data_emissao).toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-body-sm text-on-surface">
                    {Number(n.chave.slice(25, 34))} / {Number(n.chave.slice(22, 25))}
                  </td>
                  <td className="px-4 py-3">
                    <p className="max-w-80 truncate text-body text-on-surface" title={n.nome_emitente ?? ''}>
                      {n.nome_emitente}
                    </p>
                    <p className="text-label text-on-surface-variant">{formatarCnpj(n.cnpj_emitente)}</p>
                  </td>
                  <td className="px-4 py-3 text-body-sm text-on-surface">
                    <p className="max-w-48 truncate" title={n.nome_destinatario ?? ''}>
                      {nomeEmpresa(n.cnpj_destinatario, n.nome_destinatario)}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <p className="text-body font-medium text-on-surface">
                      {n.valor_total != null ? formatCurrency(Number(n.valor_total)) : '—'}
                    </p>
                    {n.situacao === 'cancelada' && <p className="text-label font-medium text-error">Cancelada</p>}
                  </td>
                  <td className="px-4 py-3">
                    {n.cartao_compras ? (
                      <>
                        <p className="max-w-56 truncate text-body-sm text-on-surface" title={n.cartao_compras.descricao ?? ''}>
                          {n.cartao_compras.descricao ?? '—'}
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
                    {n.situacao !== 'resumo' ? (
                      <div className="flex justify-end gap-3">
                        <a
                          href={`/api/cartao/notas/${n.id}/pdf`}
                          className="inline-flex items-center gap-1 text-body-sm font-medium text-primary hover:underline"
                        >
                          <IconDownload width={14} height={14} /> PDF
                        </a>
                        <a href={`/api/cartao/notas/${n.id}/xml`} className="text-body-sm font-medium text-primary hover:underline">
                          XML
                        </a>
                      </div>
                    ) : (
                      <span className="text-label text-on-surface-variant">aguardando XML</span>
                    )}
                  </td>
                </tr>
              ))}
              {notas.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-body-sm text-on-surface-variant">
                    Nenhuma nota encontrada com esses filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {paginas > 1 && (
        <div className="mt-4 flex items-center justify-center gap-4 text-body-sm">
          {pagina > 1 && (
            <Link href={`/admin/nfe-recebidas${filtrosParaUrl(filtros, { pagina: String(pagina - 1) })}`} className="font-medium text-primary hover:underline">
              ← Anterior
            </Link>
          )}
          <span className="text-on-surface-variant">
            Página {pagina} de {paginas}
          </span>
          {pagina < paginas && (
            <Link href={`/admin/nfe-recebidas${filtrosParaUrl(filtros, { pagina: String(pagina + 1) })}`} className="font-medium text-primary hover:underline">
              Próxima →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
