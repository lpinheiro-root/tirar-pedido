import Link from 'next/link';
import { requireDevolucoes } from '@/lib/auth';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { PageHeading } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { IconDownload } from '@/components/ui/Icons';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { formatarCnpj } from '@/lib/empresas';
import {
  buscarDevolucoes,
  buscarNotasFornecedores,
  filtrosParaUrl,
  lerFiltros,
  situacaoDevolucao,
  type FiltrosNFe,
} from '@/lib/nfeRecebidas';
import { nomeEmpresaPlanilha, numeroDaChave } from '@/lib/devolucoes';
import { lerConfigNFe } from '@/lib/cartao/nfe';
import { ImportarExcelForm } from './ImportarExcelForm';

const POR_PAGINA = 100;

const campoClasse =
  'h-9 rounded-md border border-[#D1D5DB] bg-surface-container-lowest px-2 text-body-sm text-on-surface';

const VAZIO = { empresa: '', mes: '', busca: '', situacao: '' } as const;

type Unidade = { cnpj: string; uf: string | null; nome: string | null };

function dataBr(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
}

/**
 * NF-e recebidas pelas empresas do grupo, em duas abas:
 * - Devoluções: NFD de clientes, com o acompanhamento da equipe preenchido no Excel;
 * - Fornecedores: notas de compra emitidas pelos fornecedores.
 */
export default async function NfeRecebidasPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  await requireDevolucoes();
  const supabase = createClient();
  const filtros = lerFiltros(searchParams);
  const pagina = Math.max(1, Number(searchParams.pagina) || 1);
  const fornecedores = filtros.aba === 'fornecedores';

  const [linhasDev, todasDev, linhasForn, todasForn, robo, { data: maisRecente }] = await Promise.all([
    fornecedores ? Promise.resolve([]) : buscarDevolucoes(supabase, filtros),
    fornecedores ? Promise.resolve([]) : buscarDevolucoes(supabase, { aba: 'devolucoes', ...VAZIO }),
    fornecedores ? buscarNotasFornecedores(supabase, filtros) : Promise.resolve([]),
    fornecedores ? buscarNotasFornecedores(supabase, { aba: 'fornecedores', ...VAZIO }) : Promise.resolve([]),
    lerConfigNFe(createServiceRoleClient()),
    supabase
      .from('cartao_notas')
      .select('data_emissao')
      .not('cnpj_destinatario', 'is', null)
      .order('data_emissao', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // unidades do grupo que já receberam notas desta aba (para o filtro e os nomes curtos)
  const unidades: Unidade[] = Array.from(
    new Map(
      [...todasDev, ...todasForn]
        .filter((d) => d.cnpj_destinatario)
        .map((d) => [d.cnpj_destinatario!, { cnpj: d.cnpj_destinatario!, uf: d.empresa_uf, nome: d.nome_destinatario }])
    ).values()
  );
  const nomeEmpresa = (cnpj: string | null, nome: string | null, uf: string | null) =>
    nomeEmpresaPlanilha(cnpj, nome, uf, unidades);
  const opcoesEmpresa = unidades
    .map((u) => ({ cnpj: u.cnpj, nome: nomeEmpresa(u.cnpj, u.nome, u.uf) }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  const total = fornecedores ? linhasForn.length : linhasDev.length;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const fatia = <T,>(l: T[]) => l.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  return (
    <div>
      <PageHeading
        title={fornecedores ? 'NF-e Recebidas — Fornecedores' : 'NF-e Recebidas — Devoluções'}
        subtitle={
          fornecedores
            ? 'Notas fiscais de compra emitidas pelos fornecedores contra as empresas do grupo.'
            : 'Notas de devolução (NFD) emitidas pelos clientes contra as empresas do grupo. O acompanhamento é preenchido no Excel: exporte, preencha e importe de volta.'
        }
      />

      <Abas atual={filtros.aba} />

      <Card className="mb-4 p-4">
        <form className="flex flex-wrap items-end gap-3">
          {fornecedores && <input type="hidden" name="aba" value="fornecedores" />}
          <div>
            <label className="mb-1 block text-label text-on-surface-variant">Empresa</label>
            <select name="empresa" defaultValue={filtros.empresa} className={campoClasse}>
              <option value="">Todas</option>
              {opcoesEmpresa.map((e) => (
                <option key={e.cnpj} value={e.cnpj}>
                  {e.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-label text-on-surface-variant">Mês de emissão</label>
            <input type="month" name="mes" defaultValue={filtros.mes} className={campoClasse} />
          </div>
          <div className="min-w-56 flex-1">
            <label className="mb-1 block text-label text-on-surface-variant">
              {fornecedores ? 'Fornecedor ou nº da NF-e' : 'Cliente ou nº da NFD'}
            </label>
            <input
              name="busca"
              defaultValue={filtros.busca}
              placeholder={fornecedores ? 'Nome, CNPJ ou número' : 'Nome, CNPJ/CPF ou número'}
              className={`${campoClasse} w-full`}
            />
          </div>
          <div>
            <label className="mb-1 block text-label text-on-surface-variant">Situação</label>
            <select name="situacao" defaultValue={filtros.situacao} className={campoClasse}>
              <option value="">Todas</option>
              {fornecedores ? (
                <option value="autorizadas">Autorizadas</option>
              ) : (
                <>
                  <option value="abertas">Em aberto</option>
                  <option value="encerradas">Encerradas</option>
                </>
              )}
              <option value="canceladas">Canceladas</option>
            </select>
          </div>
          <button type="submit" className="h-9 rounded-md bg-primary px-4 text-body-sm font-medium text-on-primary hover:bg-primary/90">
            Filtrar
          </button>
          <Link
            href={`/admin/nfe-recebidas${fornecedores ? '?aba=fornecedores' : ''}`}
            className="h-9 px-2 text-body-sm leading-9 text-on-surface-variant hover:text-primary"
          >
            Limpar
          </Link>
        </form>
      </Card>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-6">
          {fornecedores ? (
            <>
              <Indicador titulo="Notas" valor={total.toLocaleString('pt-BR')} />
              <Indicador
                titulo="Fornecedores"
                valor={new Set(linhasForn.map((n) => n.cnpj_emitente)).size.toLocaleString('pt-BR')}
              />
              <Indicador
                titulo="Valor total"
                valor={formatCurrency(
                  linhasForn.filter((n) => n.situacao !== 'cancelada').reduce((s, n) => s + Number(n.valor_total ?? 0), 0)
                )}
              />
            </>
          ) : (
            <>
              <Indicador titulo="Devoluções" valor={total.toLocaleString('pt-BR')} />
              <Indicador
                titulo="Em aberto"
                valor={linhasDev.filter((d) => situacaoDevolucao(d) === 'aberta').length.toLocaleString('pt-BR')}
              />
              <Indicador titulo="Valor total" valor={formatCurrency(linhasDev.reduce((s, d) => s + Number(d.valor_total ?? 0), 0))} />
            </>
          )}
        </div>
        <div className="flex items-start gap-4">
          <div className="text-right text-label text-on-surface-variant">
            <p>
              Notas até: <span className="font-medium text-on-surface">{dataBr(maisRecente?.data_emissao ?? null)}</span> (lidas
              do NF-Stock a cada hora)
            </p>
            <p>Robô: {robo?.ultima_consulta ? `última leitura ${formatDateTime(robo.ultima_consulta)}` : 'ainda não rodou'}</p>
          </div>
          <a
            href={`/api/nfe-recebidas/exportar${filtrosParaUrl(filtros)}`}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-primary px-3 text-body-sm font-medium text-primary hover:bg-primary/5"
          >
            <IconDownload width={16} height={16} /> Exportar Excel
          </a>
          {!fornecedores && <ImportarExcelForm />}
        </div>
      </div>

      <Card>
        {fornecedores ? (
          <table className="w-full table-fixed text-left">
            <colgroup>
              <col className="w-[13%]" />
              <col className="w-[9%]" />
              <col className="w-[30%]" />
              <col className="w-[9%]" />
              <col className="w-[11%]" />
              <col className="w-[14%]" />
              <col className="w-[8%]" />
              <col className="w-[6%]" />
            </colgroup>
            <thead className="bg-surface-container-low">
              <tr className="text-label uppercase text-on-surface-variant">
                <th className="px-3 py-3 font-medium">Empresa</th>
                <th className="px-3 py-3 font-medium">Emissão</th>
                <th className="px-3 py-3 font-medium">Fornecedor</th>
                <th className="px-3 py-3 font-medium">NF-e</th>
                <th className="px-3 py-3 text-right font-medium">Valor</th>
                <th className="px-3 py-3 font-medium">Transportadora</th>
                <th className="px-3 py-3 font-medium">Situação</th>
                <th className="px-3 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {fatia(linhasForn).map((n) => (
                <tr key={n.id} className="border-t border-border-muted hover:bg-surface-container-low/50">
                  <td className="truncate px-3 py-2.5 text-body-sm font-medium text-on-surface">
                    {nomeEmpresa(n.cnpj_destinatario, n.nome_destinatario, n.empresa_uf)}
                  </td>
                  <td className="px-3 py-2.5 text-body-sm text-on-surface-variant">{dataBr(n.data_emissao)}</td>
                  <td className="px-3 py-2.5">
                    <p className="truncate text-body-sm text-on-surface" title={n.nome_emitente ?? ''}>
                      {n.nome_emitente || '—'}
                    </p>
                    <p className="truncate text-label text-on-surface-variant">{formatarCnpj(n.cnpj_emitente)}</p>
                  </td>
                  <td className="px-3 py-2.5 text-body-sm font-medium text-on-surface">{numeroDaChave(n.chave)}</td>
                  <td className="px-3 py-2.5 text-right text-body-sm font-medium text-on-surface">
                    {n.valor_total != null ? formatCurrency(Number(n.valor_total)) : '—'}
                  </td>
                  <td className="truncate px-3 py-2.5 text-body-sm text-on-surface-variant" title={n.transportadora ?? ''}>
                    {n.transportadora || '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex cursor-default whitespace-nowrap rounded-sm px-2 py-1 text-label font-medium ${
                        n.situacao === 'cancelada' ? 'bg-error-container text-error-on-container' : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {n.situacao === 'cancelada' ? 'Cancelada' : 'Autorizada'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <BaixarNota id={n.id} />
                  </td>
                </tr>
              ))}
              {linhasForn.length === 0 && <Vazio colunas={8} texto="Nenhuma nota de fornecedor encontrada com esses filtros." />}
            </tbody>
          </table>
        ) : (
          <table className="w-full table-fixed text-left">
            <colgroup>
              <col className="w-[11%]" />
              <col className="w-[8%]" />
              <col className="w-[24%]" />
              <col className="w-[8%]" />
              <col className="w-[11%]" />
              <col className="w-[9%]" />
              <col className="w-[13%]" />
              <col className="w-[10%]" />
              <col className="w-[6%]" />
            </colgroup>
            <thead className="bg-surface-container-low">
              <tr className="text-label uppercase text-on-surface-variant">
                <th className="px-3 py-3 font-medium">Empresa</th>
                <th className="px-3 py-3 font-medium">Emissão</th>
                <th className="px-3 py-3 font-medium">Cliente</th>
                <th className="px-3 py-3 font-medium">NFD</th>
                <th className="px-3 py-3 font-medium">Nota de origem</th>
                <th className="px-3 py-3 text-right font-medium">Valor</th>
                <th className="px-3 py-3 font-medium">Motivo</th>
                <th className="px-3 py-3 font-medium">Situação</th>
                <th className="px-3 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {fatia(linhasDev).map((d) => {
                const a = d.devolucoes_acompanhamento;
                const situacao = situacaoDevolucao(d);
                const origens = (d.notas_origem ?? []).map(numeroDaChave);
                return (
                  <tr key={d.id} className="border-t border-border-muted hover:bg-surface-container-low/50">
                    <td className="truncate px-3 py-2.5 text-body-sm font-medium text-on-surface">
                      {nomeEmpresa(d.cnpj_destinatario, d.nome_destinatario, d.empresa_uf)}
                    </td>
                    <td className="px-3 py-2.5 text-body-sm text-on-surface-variant">{dataBr(d.data_emissao)}</td>
                    <td className="px-3 py-2.5">
                      <p className="truncate text-body-sm text-on-surface" title={d.cliente_nome ?? ''}>
                        {d.cliente_nome ?? '—'}
                      </p>
                      <p className="truncate text-label text-on-surface-variant">
                        {formatarCnpj(d.cliente_doc)}
                        {d.cliente_uf ? ` · ${d.cliente_uf}` : ''}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-body-sm font-medium text-on-surface">{numeroDaChave(d.chave)}</td>
                    <td className="truncate px-3 py-2.5 text-body-sm text-on-surface-variant" title={origens.join(', ')}>
                      {origens.join(', ') || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right text-body-sm font-medium text-on-surface">
                      {d.valor_total != null ? formatCurrency(Number(d.valor_total)) : '—'}
                    </td>
                    <td className="truncate px-3 py-2.5 text-body-sm text-on-surface-variant" title={a?.motivo ?? ''}>
                      {a?.motivo ?? '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        title={situacao === 'cancelada' ? 'NFD cancelada no NF-Stock' : (a?.status ?? 'Sem status preenchido')}
                        className={`inline-flex cursor-default whitespace-nowrap rounded-sm px-2 py-1 text-label font-medium ${
                          situacao === 'cancelada'
                            ? 'bg-error-container text-error-on-container'
                            : situacao === 'encerrada'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {situacao === 'cancelada' ? 'Cancelada' : situacao === 'encerrada' ? 'Encerrada' : 'Em aberto'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <BaixarNota id={d.id} />
                    </td>
                  </tr>
                );
              })}
              {linhasDev.length === 0 && <Vazio colunas={9} texto="Nenhuma devolução encontrada com esses filtros." />}
            </tbody>
          </table>
        )}
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

function Abas({ atual }: { atual: FiltrosNFe['aba'] }) {
  const abas = [
    { id: 'devolucoes', label: 'Devoluções', href: '/admin/nfe-recebidas' },
    { id: 'fornecedores', label: 'Fornecedores', href: '/admin/nfe-recebidas?aba=fornecedores' },
  ] as const;
  return (
    <div className="mb-4 flex gap-1 border-b border-border-muted">
      {abas.map((a) => (
        <Link
          key={a.id}
          href={a.href}
          className={`-mb-px border-b-2 px-4 py-2 text-body-sm font-medium ${
            atual === a.id
              ? 'border-primary text-primary'
              : 'border-transparent text-on-surface-variant hover:text-on-surface'
          }`}
        >
          {a.label}
        </Link>
      ))}
    </div>
  );
}

function Indicador({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <p className="text-label uppercase text-on-surface-variant">{titulo}</p>
      <p className="text-h2 text-on-surface">{valor}</p>
    </div>
  );
}

function BaixarNota({ id }: { id: string }) {
  return (
    <div className="flex justify-end gap-2">
      <a
        href={`/api/cartao/notas/${id}/pdf`}
        title="Baixar PDF"
        className="inline-flex items-center gap-1 text-label font-medium text-primary hover:underline"
      >
        <IconDownload width={13} height={13} /> PDF
      </a>
      <a href={`/api/cartao/notas/${id}/xml`} title="Baixar XML" className="text-label font-medium text-primary hover:underline">
        XML
      </a>
    </div>
  );
}

function Vazio({ colunas, texto }: { colunas: number; texto: string }) {
  return (
    <tr>
      <td colSpan={colunas} className="px-4 py-8 text-center text-body-sm text-on-surface-variant">
        {texto}
      </td>
    </tr>
  );
}
