import Link from 'next/link';
import { requireContasPagar } from '@/lib/auth';
import { PageHeading } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { IconDownload } from '@/components/ui/Icons';
import { formatCurrency } from '@/lib/format';
import {
  CATEGORIAS,
  MAX_DIAS,
  aplicarFiltros,
  buscarTitulos,
  categoria,
  diasNoPeriodo,
  empresasDosTitulos,
  filtrosParaUrl,
  lerFiltros,
  porCategoria,
  porConta,
  porFavorecido,
  porPeriodo,
  totais,
  type Categoria,
  type Filtros,
  type TituloCP,
} from '@/lib/contasPagar/dados';

export const dynamic = 'force-dynamic';

const ABAS = [
  { id: 'periodo', rotulo: 'Por período' },
  { id: 'contas', rotulo: 'Contas contábeis' },
  { id: 'favorecido', rotulo: 'Favorecido' },
  { id: 'titulos', rotulo: 'Títulos' },
] as const;
type Aba = (typeof ABAS)[number]['id'];

const COR: Record<Categoria, string> = {
  embalagem: 'bg-sky-100 text-sky-800',
  materia_prima: 'bg-amber-100 text-amber-800',
  frete: 'bg-violet-100 text-violet-800',
  outras: 'bg-surface-container text-on-surface-variant',
};
const ROTULO = Object.fromEntries(CATEGORIAS.map((c) => [c.id, c.rotulo])) as Record<Categoria, string>;
const campo = 'h-9 rounded-md border border-[#D1D5DB] bg-surface-container-lowest px-2 text-body-sm text-on-surface';
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const LIMITE_TITULOS = 500;

/**
 * Contas a Pagar: consulta o ERP (só leitura) — embalagem, matéria-prima e frete
 * (e as demais contas, se marcadas) por dia, semana ou mês de vencimento.
 */
export default async function ContasPagarPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  await requireContasPagar();
  const f = lerFiltros(searchParams);
  const aba: Aba = ABAS.some((a) => a.id === searchParams.aba) ? (searchParams.aba as Aba) : 'periodo';

  let erro: string | null = null;
  let todos: TituloCP[] = [];
  if (diasNoPeriodo(f) < 1) erro = 'A data final é antes da inicial.';
  else if (diasNoPeriodo(f) > MAX_DIAS) erro = `Escolha um período de até ${MAX_DIAS} dias.`;
  else {
    try {
      todos = await buscarTitulos(f.de, f.ate);
    } catch (e) {
      console.error('[contas-pagar]', e);
      erro = 'Não consegui consultar o ERP agora. Tente de novo em instantes.';
    }
  }

  const titulos = aplicarFiltros(todos, f);
  const geral = totais(titulos);
  const cats = porCategoria(aplicarFiltros(todos, { ...f, categorias: CATEGORIAS.map((c) => c.id) }));
  const empresas = empresasDosTitulos(todos);

  return (
    <div>
      <PageHeading
        title="Contas a Pagar"
        subtitle="Títulos a pagar do ERP por vencimento: embalagem, matéria-prima, frete e demais contas. Só consulta — nada é alterado no ERP."
      />

      <Card className="mb-4 p-4">
        <form className="flex flex-wrap items-end gap-3" method="get">
          <input type="hidden" name="aba" value={aba} />
          <div>
            <label className="mb-1 block text-label text-on-surface-variant">Vencimento de</label>
            <input type="date" name="de" defaultValue={f.de} className={campo} />
          </div>
          <div>
            <label className="mb-1 block text-label text-on-surface-variant">até</label>
            <input type="date" name="ate" defaultValue={f.ate} className={campo} />
          </div>
          <div>
            <label className="mb-1 block text-label text-on-surface-variant">Agrupar por</label>
            <select name="agrupar" defaultValue={f.agrupar} className={campo}>
              <option value="dia">Dia</option>
              <option value="semana">Semana</option>
              <option value="mes">Mês</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-label text-on-surface-variant">Empresa</label>
            <select name="empresa" defaultValue={f.empresa} className={`${campo} max-w-64`}>
              <option value="">Todas</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-label text-on-surface-variant">Situação</label>
            <select name="situacao" defaultValue={f.situacao} className={campo}>
              <option value="todos">Todos</option>
              <option value="aberto">Em aberto</option>
              <option value="pago">Pagos</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-label text-on-surface-variant">Contas</label>
            <div className="flex h-9 flex-wrap items-center gap-3">
              {CATEGORIAS.map((c) => (
                <label key={c.id} className="inline-flex cursor-pointer items-center gap-1.5 text-body-sm text-on-surface">
                  <input
                    type="checkbox"
                    name="cat"
                    value={c.id}
                    defaultChecked={f.categorias.includes(c.id)}
                    className="h-4 w-4 accent-primary"
                  />
                  {c.rotulo}
                </label>
              ))}
            </div>
          </div>
          <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 text-body-sm text-on-surface">
            <input type="checkbox" name="grupo" value="sem" defaultChecked={f.semGrupo} className="h-4 w-4 accent-primary" />
            Sem fornecedores do grupo
          </label>
          <button
            type="submit"
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-body-sm font-medium text-on-primary hover:bg-primary/90"
          >
            Consultar
          </button>
          <a
            href={`/api/contas-pagar/exportar${filtrosParaUrl(f)}`}
            className="ml-auto inline-flex h-9 items-center gap-2 rounded-md border border-primary px-3 text-body-sm font-medium text-primary hover:bg-primary/5"
          >
            <IconDownload width={16} height={16} /> Exportar Excel
          </a>
        </form>
      </Card>

      {erro ? (
        <Card className="p-6 text-body-sm text-error">{erro}</Card>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              { t: 'Valor original', v: geral.valor, c: 'text-on-surface' },
              { t: 'Pago', v: geral.pago, c: 'text-green-700' },
              { t: 'Saldo', v: geral.saldo, c: geral.saldo > 0 ? 'text-amber-700' : 'text-on-surface' },
            ].map((k) => (
              <Card key={k.t} className="p-4">
                <p className="text-label uppercase text-on-surface-variant">{k.t}</p>
                <p className={`mt-1 text-h1 ${k.c}`}>{formatCurrency(k.v)}</p>
                <p className="text-label text-on-surface-variant">
                  {geral.titulos} título(s) · {br(f.de)} a {br(f.ate)}
                </p>
              </Card>
            ))}
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {CATEGORIAS.map((c) => {
              const x = cats[c.id];
              const ativo = f.categorias.includes(c.id);
              return (
                <Card key={c.id} className={`p-4 ${ativo ? '' : 'opacity-50'}`}>
                  <span className={`rounded-sm px-2 py-0.5 text-label font-medium ${COR[c.id]}`}>{c.rotulo}</span>
                  <p className="mt-2 text-h2 text-on-surface">{formatCurrency(x.valor)}</p>
                  <p className="text-label text-on-surface-variant">
                    pago {formatCurrency(x.pago)} · saldo {formatCurrency(x.saldo)} · {x.titulos} título(s)
                  </p>
                </Card>
              );
            })}
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            {ABAS.map((a) => (
              <Link
                key={a.id}
                href={filtrosParaUrl(f, { aba: a.id })}
                className={`rounded-full px-3 py-1.5 text-body-sm font-medium ${
                  aba === a.id ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                {a.rotulo}
              </Link>
            ))}
          </div>

          {aba === 'periodo' && <TabelaPeriodo titulos={titulos} f={f} />}
          {aba === 'contas' && <TabelaContas titulos={titulos} />}
          {aba === 'favorecido' && <TabelaFavorecido titulos={titulos} />}
          {aba === 'titulos' && <TabelaTitulos titulos={titulos} />}
        </>
      )}
    </div>
  );
}

const th = 'px-3 py-2.5 font-medium';
const td = 'px-3 py-2 text-body-sm';

function TabelaPeriodo({ titulos, f }: { titulos: TituloCP[]; f: Filtros }) {
  const linhas = porPeriodo(titulos, f.agrupar);
  const cats = CATEGORIAS.filter((c) => f.categorias.includes(c.id));
  const total = totais(titulos);
  const totalCat = porCategoria(titulos);
  const nomeAgrupar = f.agrupar === 'dia' ? 'Dia' : f.agrupar === 'semana' ? 'Semana' : 'Mês';
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-surface-container-low text-label uppercase text-on-surface-variant">
            <tr>
              <th className={th}>{nomeAgrupar} (vencimento)</th>
              {cats.map((c) => (
                <th key={c.id} className={`${th} text-right`}>
                  {c.rotulo}
                </th>
              ))}
              <th className={`${th} text-right`}>Total</th>
              <th className={`${th} text-right`}>Pago</th>
              <th className={`${th} text-right`}>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.chave} className="border-t border-border-muted">
                <td className={`${td} whitespace-nowrap text-on-surface`}>{l.rotulo}</td>
                {cats.map((c) => (
                  <td key={c.id} className={`${td} text-right text-on-surface`}>
                    {l.cat[c.id].valor ? formatCurrency(l.cat[c.id].valor) : <span className="text-outline">—</span>}
                  </td>
                ))}
                <td className={`${td} text-right font-medium text-on-surface`}>{formatCurrency(l.total.valor)}</td>
                <td className={`${td} text-right text-green-700`}>{formatCurrency(l.total.pago)}</td>
                <td className={`${td} text-right ${l.total.saldo > 0.01 ? 'text-amber-700' : 'text-on-surface-variant'}`}>
                  {formatCurrency(l.total.saldo)}
                </td>
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={cats.length + 4} className="px-4 py-8 text-center text-body-sm text-on-surface-variant">
                  Nenhum título nesse período com esses filtros.
                </td>
              </tr>
            )}
          </tbody>
          {linhas.length > 0 && (
            <tfoot className="border-t-2 border-border-muted bg-surface-container-low font-semibold">
              <tr>
                <td className={td}>Total</td>
                {cats.map((c) => (
                  <td key={c.id} className={`${td} text-right`}>
                    {formatCurrency(totalCat[c.id].valor)}
                  </td>
                ))}
                <td className={`${td} text-right`}>{formatCurrency(total.valor)}</td>
                <td className={`${td} text-right text-green-700`}>{formatCurrency(total.pago)}</td>
                <td className={`${td} text-right text-amber-700`}>{formatCurrency(total.saldo)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  );
}

function TabelaContas({ titulos }: { titulos: TituloCP[] }) {
  const linhas = porConta(titulos);
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-surface-container-low text-label uppercase text-on-surface-variant">
            <tr>
              <th className={th}>Conta contábil pai</th>
              <th className={th}>Conta contábil</th>
              <th className={`${th} text-right`}>Títulos</th>
              <th className={`${th} text-right`}>Valor original</th>
              <th className={`${th} text-right`}>Pago</th>
              <th className={`${th} text-right`}>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={`${l.contaPai}|${l.conta}`} className="border-t border-border-muted">
                <td className={`${td} text-on-surface`}>
                  <span className={`mr-2 rounded-sm px-1.5 py-0.5 text-label ${COR[categoria(l)]}`}>{ROTULO[categoria(l)]}</span>
                  {l.contaPai}
                </td>
                <td className={`${td} text-on-surface`}>{l.conta}</td>
                <td className={`${td} text-right text-on-surface-variant`}>{l.total.titulos}</td>
                <td className={`${td} text-right font-medium text-on-surface`}>{formatCurrency(l.total.valor)}</td>
                <td className={`${td} text-right text-green-700`}>{formatCurrency(l.total.pago)}</td>
                <td className={`${td} text-right text-amber-700`}>{formatCurrency(l.total.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function TabelaFavorecido({ titulos }: { titulos: TituloCP[] }) {
  const linhas = porFavorecido(titulos);
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-surface-container-low text-label uppercase text-on-surface-variant">
            <tr>
              <th className={th}>Favorecido</th>
              <th className={th}>Contas</th>
              <th className={`${th} text-right`}>Títulos</th>
              <th className={`${th} text-right`}>Valor original</th>
              <th className={`${th} text-right`}>Pago</th>
              <th className={`${th} text-right`}>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.favorecido} className="border-t border-border-muted">
                <td className={`${td} text-on-surface`}>{l.favorecido}</td>
                <td className={td}>
                  <div className="flex flex-wrap gap-1">
                    {Array.from(l.categorias).map((c) => (
                      <span key={c} className={`rounded-sm px-1.5 py-0.5 text-label ${COR[c]}`}>
                        {ROTULO[c]}
                      </span>
                    ))}
                  </div>
                </td>
                <td className={`${td} text-right text-on-surface-variant`}>{l.total.titulos}</td>
                <td className={`${td} text-right font-medium text-on-surface`}>{formatCurrency(l.total.valor)}</td>
                <td className={`${td} text-right text-green-700`}>{formatCurrency(l.total.pago)}</td>
                <td className={`${td} text-right text-amber-700`}>{formatCurrency(l.total.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function TabelaTitulos({ titulos }: { titulos: TituloCP[] }) {
  const visiveis = titulos.slice(0, LIMITE_TITULOS);
  return (
    <Card>
      {titulos.length > LIMITE_TITULOS && (
        <p className="border-b border-border-muted px-4 py-2 text-label text-on-surface-variant">
          Mostrando os {LIMITE_TITULOS} primeiros de {titulos.length} títulos. O Excel traz todos.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-surface-container-low text-label uppercase text-on-surface-variant">
            <tr>
              <th className={th}>Vencimento</th>
              <th className={th}>Empresa</th>
              <th className={th}>Favorecido</th>
              <th className={th}>Documento</th>
              <th className={th}>Conta</th>
              <th className={th}>Espécie</th>
              <th className={`${th} text-right`}>Valor</th>
              <th className={`${th} text-right`}>Pago</th>
              <th className={`${th} text-right`}>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((t) => (
              <tr key={`${t.finMovId}|${t.conta}`} className="border-t border-border-muted align-top">
                <td className={`${td} whitespace-nowrap text-on-surface-variant`}>{br(t.vencimento)}</td>
                <td className={`${td} max-w-44 truncate text-on-surface-variant`} title={t.empresa}>
                  {t.empresa}
                </td>
                <td className={`${td} max-w-64 text-on-surface`}>
                  <p className="truncate" title={t.favorecido}>
                    {t.favorecido}
                  </p>
                  {t.historico && (
                    <p className="truncate text-label text-on-surface-variant" title={t.historico}>
                      {t.historico}
                    </p>
                  )}
                </td>
                <td className={`${td} whitespace-nowrap text-on-surface-variant`}>{t.documento ?? '—'}</td>
                <td className={td}>
                  <span className={`rounded-sm px-1.5 py-0.5 text-label ${COR[categoria(t)]}`}>{ROTULO[categoria(t)]}</span>
                  <p className="mt-0.5 max-w-52 truncate text-label text-on-surface-variant" title={`${t.contaPai} › ${t.conta}`}>
                    {t.conta}
                  </p>
                </td>
                <td className={`${td} text-on-surface-variant`}>{t.especie ?? '—'}</td>
                <td className={`${td} whitespace-nowrap text-right font-medium text-on-surface`}>{formatCurrency(t.valor)}</td>
                <td className={`${td} whitespace-nowrap text-right text-green-700`}>{formatCurrency(t.pago)}</td>
                <td className={`${td} whitespace-nowrap text-right ${t.saldo > 0.01 ? 'text-amber-700' : 'text-on-surface-variant'}`}>
                  {formatCurrency(t.saldo)}
                </td>
              </tr>
            ))}
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-body-sm text-on-surface-variant">
                  Nenhum título nesse período com esses filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
