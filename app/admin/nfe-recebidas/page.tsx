import Link from 'next/link';
import { requireDevolucoes } from '@/lib/auth';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { PageHeading } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { IconDownload } from '@/components/ui/Icons';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { formatarCnpj } from '@/lib/empresas';
import { buscarDevolucoes, filtrosParaUrl, lerFiltros } from '@/lib/nfeRecebidas';
import { CAMPOS, nomeEmpresaPlanilha, numeroDaChave, ocorrenciaEncerrada, opcoesDoCampo, type CampoAcompanhamento } from '@/lib/devolucoes';
import { buscarTodas } from '@/lib/supabasePaginado';
import type { Acompanhamento } from '@/lib/nfeRecebidas';
import { lerConfigNFe } from '@/lib/cartao/nfe';
import { CelulaEditavel } from './CelulaEditavel';
import { ImportarExcelForm } from './ImportarExcelForm';

const POR_PAGINA = 100;

const campoClasse =
  'h-9 rounded-md border border-[#D1D5DB] bg-surface-container-lowest px-2 text-body-sm text-on-surface';

const opcoesDe = (campo: string) => CAMPOS.find((c) => c.campo === campo)!;

export default async function NfeRecebidasPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  await requireDevolucoes();
  const supabase = createClient();
  const filtros = lerFiltros(searchParams);
  const pagina = Math.max(1, Number(searchParams.pagina) || 1);

  const [devolucoes, todasEmpresas, robo, { data: maisRecente }, respostas] = await Promise.all([
    buscarDevolucoes(supabase, filtros),
    // unidades do grupo que já receberam devoluções (para o filtro e os nomes curtos)
    buscarDevolucoes(supabase, { empresa: '', mes: '', busca: '', situacao: '' }),
    lerConfigNFe(createServiceRoleClient()),
    supabase
      .from('cartao_notas')
      .select('data_emissao')
      .not('cnpj_destinatario', 'is', null)
      .order('data_emissao', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // respostas já usadas (planilhas importadas + sistema) viram as opções de cada campo
    buscarTodas<Acompanhamento>((de, ate) =>
      supabase
        .from('devolucoes_acompanhamento')
        .select('motivo, volta_fabrica, retorno, transportadora, transportadora_debitada, pagamento_cliente, pagamento_feito, status, nf_fiscal')
        .order('chave')
        .range(de, ate)
    ),
  ]);
  const opcoes = Object.fromEntries(
    CAMPOS.map((c) => [c.campo, opcoesDoCampo(c.campo, respostas.map((r) => r[c.campo]))])
  ) as Record<CampoAcompanhamento, string[]>;

  const unidades = Array.from(
    new Map(
      todasEmpresas
        .filter((d) => d.cnpj_destinatario)
        .map((d) => [d.cnpj_destinatario!, { cnpj: d.cnpj_destinatario!, uf: d.empresa_uf, nome: d.nome_destinatario }])
    ).values()
  );
  const nomeEmpresa = (cnpj: string | null, nome: string | null, uf: string | null) =>
    nomeEmpresaPlanilha(cnpj, nome, uf, unidades);
  const opcoesEmpresa = unidades
    .map((u) => ({ cnpj: u.cnpj, nome: nomeEmpresa(u.cnpj, u.nome, u.uf) }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  const total = devolucoes.length;
  const soma = devolucoes.reduce((s, d) => s + Number(d.valor_total ?? 0), 0);
  const abertas = devolucoes.filter((d) => !ocorrenciaEncerrada(d.devolucoes_acompanhamento?.status)).length;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const visiveis = devolucoes.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  return (
    <div>
      <PageHeading
        title="NF-e Recebidas — Devoluções"
        subtitle="Notas de devolução (NFD) emitidas pelos clientes contra as empresas do grupo, trazidas do Alterdata."
      />

      <Card className="mb-4 p-4">
        <form className="flex flex-wrap items-end gap-3">
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
            <label className="mb-1 block text-label text-on-surface-variant">Cliente ou nº da NFD</label>
            <input
              name="busca"
              defaultValue={filtros.busca}
              placeholder="Nome, CNPJ/CPF ou número"
              className={`${campoClasse} w-full`}
            />
          </div>
          <div>
            <label className="mb-1 block text-label text-on-surface-variant">Situação</label>
            <select name="situacao" defaultValue={filtros.situacao} className={campoClasse}>
              <option value="">Todas</option>
              <option value="abertas">Em aberto</option>
              <option value="encerradas">Encerradas</option>
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
            <p className="text-label uppercase text-on-surface-variant">Devoluções</p>
            <p className="text-h2 text-on-surface">{total.toLocaleString('pt-BR')}</p>
          </div>
          <div>
            <p className="text-label uppercase text-on-surface-variant">Em aberto</p>
            <p className="text-h2 text-on-surface">{abertas.toLocaleString('pt-BR')}</p>
          </div>
          <div>
            <p className="text-label uppercase text-on-surface-variant">Valor total</p>
            <p className="text-h2 text-on-surface">{formatCurrency(soma)}</p>
          </div>
        </div>
        <div className="flex items-start gap-4">
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
            <p>Robô: {robo?.ultima_consulta ? `última leitura ${formatDateTime(robo.ultima_consulta)}` : 'ainda não rodou'}</p>
          </div>
          <a
            href={`/api/nfe-recebidas/exportar${filtrosParaUrl(filtros)}`}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-primary px-3 text-body-sm font-medium text-primary hover:bg-primary/5"
          >
            <IconDownload width={16} height={16} /> Exportar Excel
          </a>
          <ImportarExcelForm />
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-container-low">
              <tr className="text-label uppercase text-on-surface-variant">
                <th className="px-3 py-3 font-medium">Empresa</th>
                <th className="px-3 py-3 font-medium">Emissão</th>
                <th className="px-3 py-3 font-medium">Cliente</th>
                <th className="px-3 py-3 font-medium">Nota de origem</th>
                <th className="px-3 py-3 font-medium">NFD</th>
                <th className="px-3 py-3 text-right font-medium">Valor</th>
                {CAMPOS.slice(0, 7).map((c) => (
                  <th key={c.campo} className="min-w-[140px] px-3 py-3 font-medium">
                    {c.titulo}
                  </th>
                ))}
                <th className="px-3 py-3 font-medium">Estado</th>
                <th className="min-w-[180px] px-3 py-3 font-medium">Status</th>
                <th className="min-w-[180px] px-3 py-3 font-medium">NF fiscal</th>
                <th className="px-3 py-3 font-medium">Baixar</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((d) => {
                const a = d.devolucoes_acompanhamento;
                return (
                  <tr key={d.id} className="border-t border-border-muted align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-body-sm font-medium text-on-surface">
                      {nomeEmpresa(d.cnpj_destinatario, d.nome_destinatario, d.empresa_uf)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-body-sm text-on-surface-variant">
                      {d.data_emissao ? new Date(d.data_emissao).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <p className="max-w-56 truncate text-body-sm text-on-surface" title={d.cliente_nome ?? ''}>
                        {d.cliente_nome ?? '—'}
                      </p>
                      <p className="text-label text-on-surface-variant">
                        {formatarCnpj(d.cliente_doc)}
                        {d.devolucao_origem === 'propria' ? ' · entrada própria' : ''}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-body-sm text-on-surface">
                      {(d.notas_origem ?? []).map(numeroDaChave).join(', ') || '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-body-sm font-medium text-on-surface">
                      {numeroDaChave(d.chave)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-body-sm font-medium text-on-surface">
                      {d.valor_total != null ? formatCurrency(Number(d.valor_total)) : '—'}
                      {d.situacao === 'cancelada' && <p className="text-label font-medium text-error">Cancelada</p>}
                    </td>
                    {CAMPOS.slice(0, 7).map((c) => (
                      <td key={c.campo} className="px-2 py-1.5">
                        <CelulaEditavel
                          chave={d.chave}
                          campo={c.campo}
                          titulo={c.titulo}
                          opcoes={opcoes[c.campo]}
                          valor={a?.[c.campo] ?? null}
                          sugestao={c.campo === 'transportadora' ? d.transportadora : null}
                        />
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-3 py-2 text-body-sm text-on-surface">{d.cliente_uf ?? '—'}</td>
                    {(['status', 'nf_fiscal'] as const).map((campo) => (
                      <td key={campo} className="px-2 py-1.5">
                        <CelulaEditavel
                          chave={d.chave}
                          campo={campo}
                          titulo={opcoesDe(campo).titulo}
                          opcoes={opcoes[campo]}
                          valor={a?.[campo] ?? null}
                          destaque
                        />
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-3 py-2">
                      <div className="flex gap-3">
                        <a
                          href={`/api/cartao/notas/${d.id}/pdf`}
                          className="inline-flex items-center gap-1 text-body-sm font-medium text-primary hover:underline"
                        >
                          <IconDownload width={14} height={14} /> PDF
                        </a>
                        <a href={`/api/cartao/notas/${d.id}/xml`} className="text-body-sm font-medium text-primary hover:underline">
                          XML
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visiveis.length === 0 && (
                <tr>
                  <td colSpan={18} className="px-4 py-8 text-center text-body-sm text-on-surface-variant">
                    Nenhuma devolução encontrada com esses filtros.
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
