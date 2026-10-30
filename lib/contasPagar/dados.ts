import { getPool } from '@/lib/sqlserver';

/**
 * Contas a pagar lidas do ERP (WORK_NATUHAIR), só leitura. A view
 * vFinMovimentosCTB é a mesma da tela "Contas contábeis" do ERP: um título por
 * linha (ou uma linha por conta, quando o título é rateado), já com
 * ContaContabilPai / ContaContabil. Valores por linha usam o valor do rateio,
 * para o total não contar duas vezes o título dividido em contas.
 */

export interface TituloCP {
  finMovId: number;
  vencimento: string; // AAAA-MM-DD
  emissao: string | null;
  empresaId: string;
  empresa: string;
  favorecidoCod: string | null;
  favorecido: string;
  documento: string | null;
  especie: string | null;
  historico: string | null;
  contaPai: string;
  conta: string;
  fornecedorDoGrupo: boolean;
  valor: number;
  pago: number;
  saldo: number;
}

export type Agrupamento = 'dia' | 'semana' | 'mes';
export type Situacao = 'todos' | 'aberto' | 'pago';

/** As categorias que o financeiro acompanha; o resto vai para "Outras contas". */
export const CATEGORIAS = [
  { id: 'embalagem', rotulo: 'Embalagem' },
  { id: 'materia_prima', rotulo: 'Matéria-prima' },
  { id: 'frete', rotulo: 'Frete' },
  { id: 'outras', rotulo: 'Outras contas' },
] as const;
export type Categoria = (typeof CATEGORIAS)[number]['id'];

/**
 * Frete é uma conta (FRETES ENTREGAS) dentro de ADMINISTRATIVO. Embalagem e
 * matéria-prima são contas-pai (MATRIZ - EMBALAGEM) ou contas de FORNECEDORES
 * (FORNECEDORES > EMBALAGEM), que o fluxo de caixa do ERP soma no mesmo grupo.
 */
export function categoria(t: Pick<TituloCP, 'contaPai' | 'conta'>): Categoria {
  if (/FRETE/i.test(t.conta)) return 'frete';
  const contas = `${t.contaPai} ${t.conta}`;
  if (/EMBALAGEM/i.test(contas)) return 'embalagem';
  if (/PRIMA/i.test(contas)) return 'materia_prima';
  return 'outras';
}

const DIA = 86_400_000;
export const MAX_DIAS = 400;

export async function buscarTitulos(de: string, ate: string): Promise<TituloCP[]> {
  const pool = await getPool();
  const { recordset } = await pool
    .request()
    .input('de', de)
    .input('ate', ate)
    .query(`
      SELECT FinMovID, CONVERT(char(10), Vencimento, 23) AS Vencimento, CONVERT(char(10), Emissao, 23) AS Emissao,
        EmpresaID, NomeEmpresa, ClienteCod, ClienteDesc, Documento, Especie, Historico,
        ContaContabilPai, ContaContabil, EmpresaGrupo,
        COALESCE(ValorRateio, ValorOriginal) AS Valor, ISNULL(ValorPagoCTB, 0) AS Pago, SaldoCTB, Saldo
      FROM dbo.vFinMovimentosCTB
      WHERE Tipo = 'CP' AND Vencimento >= CAST(@de AS date) AND Vencimento < DATEADD(day, 1, CAST(@ate AS date))
        -- título com desconto de 100% não é conta a pagar: ficaria no valor original com saldo zero
        AND NOT (ISNULL(Desconto, 0) > 0 AND ISNULL(Desconto, 0) >= ISNULL(ValorOriginal, 0) - 0.01 AND ISNULL(ValorPago, 0) = 0)
      ORDER BY Vencimento, NomeEmpresa, ClienteDesc`);

  return (recordset as Record<string, unknown>[]).map((r) => {
    const valor = Number(r.Valor ?? 0);
    const pago = Number(r.Pago ?? 0);
    const saldoView = r.SaldoCTB ?? r.Saldo;
    return {
      finMovId: Number(r.FinMovID),
      vencimento: String(r.Vencimento),
      emissao: r.Emissao ? String(r.Emissao) : null,
      empresaId: String(r.EmpresaID ?? ''),
      empresa: String(r.NomeEmpresa ?? r.EmpresaID ?? '').trim(),
      favorecidoCod: r.ClienteCod ? String(r.ClienteCod) : null,
      favorecido: String(r.ClienteDesc ?? '—').trim(),
      documento: r.Documento ? String(r.Documento).trim() : null,
      especie: r.Especie ? String(r.Especie).trim() : null,
      historico: r.Historico ? String(r.Historico).trim() : null,
      contaPai: String(r.ContaContabilPai ?? 'SEM CONTA').trim(),
      conta: String(r.ContaContabil ?? 'SEM CONTA').trim(),
      fornecedorDoGrupo: Boolean(r.EmpresaGrupo),
      valor,
      pago,
      saldo: saldoView != null ? Number(saldoView) : Math.max(0, valor - pago),
    };
  });
}

// ── períodos ──
const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const somarDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DIA).toISOString().slice(0, 10);

/** chave e rótulo do período de um dia (semana começa na segunda) */
export function periodo(dia: string, agrupar: Agrupamento): { chave: string; rotulo: string } {
  if (agrupar === 'mes') {
    const [a, m] = dia.split('-').map(Number);
    return { chave: dia.slice(0, 7), rotulo: `${MESES[m - 1]}/${a}` };
  }
  const semana = new Date(`${dia}T00:00:00Z`).getUTCDay();
  if (agrupar === 'semana') {
    const inicio = somarDias(dia, -((semana + 6) % 7));
    return { chave: inicio, rotulo: `${br(inicio)} a ${br(somarDias(inicio, 6))}` };
  }
  return { chave: dia, rotulo: `${br(dia)} (${DIAS_SEMANA[semana]})` };
}

export interface Filtros {
  de: string;
  ate: string;
  agrupar: Agrupamento;
  empresa: string; // '' = todas
  situacao: Situacao;
  semGrupo: boolean; // tira os títulos de fornecedores que são empresas do grupo
  categorias: Categoria[];
}

export function lerFiltros(entrada: Record<string, string | string[] | undefined>): Filtros {
  // o formulário manda várias caixinhas com o mesmo nome (cat=a&cat=b): vira "a,b"
  const sp = Object.fromEntries(
    Object.entries(entrada).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : v])
  ) as Record<string, string | undefined>;
  const hoje = new Date();
  const primeiro = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), 1)).toISOString().slice(0, 10);
  const ultimo = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth() + 1, 0)).toISOString().slice(0, 10);
  const data = (v: string | undefined, padrao: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : padrao);
  const cats = (sp.cat ?? 'embalagem,materia_prima,frete')
    .split(',')
    .filter((c): c is Categoria => CATEGORIAS.some((x) => x.id === c));
  return {
    de: data(sp.de, primeiro),
    ate: data(sp.ate, ultimo),
    agrupar: sp.agrupar === 'semana' || sp.agrupar === 'mes' ? sp.agrupar : 'dia',
    empresa: sp.empresa ?? '',
    situacao: sp.situacao === 'aberto' || sp.situacao === 'pago' ? sp.situacao : 'todos',
    semGrupo: sp.grupo === 'sem',
    categorias: cats.length ? cats : ['embalagem', 'materia_prima', 'frete'],
  };
}

export function filtrosParaUrl(f: Filtros, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams({
    de: f.de,
    ate: f.ate,
    agrupar: f.agrupar,
    ...(f.empresa ? { empresa: f.empresa } : {}),
    ...(f.situacao !== 'todos' ? { situacao: f.situacao } : {}),
    ...(f.semGrupo ? { grupo: 'sem' } : {}),
    cat: f.categorias.join(','),
    ...extra,
  });
  return `?${p}`;
}

export function aplicarFiltros(titulos: TituloCP[], f: Filtros): TituloCP[] {
  return titulos.filter(
    (t) =>
      (!f.empresa || t.empresaId === f.empresa) &&
      (!f.semGrupo || !t.fornecedorDoGrupo) &&
      (f.situacao === 'todos' || (f.situacao === 'aberto' ? t.saldo > 0.01 : t.saldo <= 0.01)) &&
      f.categorias.includes(categoria(t))
  );
}

// ── agregações ──
export interface Totais {
  valor: number;
  pago: number;
  saldo: number;
  titulos: number;
}
const vazio = (): Totais => ({ valor: 0, pago: 0, saldo: 0, titulos: 0 });
function somar(a: Totais, t: TituloCP) {
  a.valor += t.valor;
  a.pago += t.pago;
  a.saldo += t.saldo;
  a.titulos++;
}

export function totais(titulos: TituloCP[]): Totais {
  const a = vazio();
  titulos.forEach((t) => somar(a, t));
  return a;
}

/** linhas = períodos; colunas = categorias */
export function porPeriodo(titulos: TituloCP[], agrupar: Agrupamento) {
  const mapa = new Map<string, { rotulo: string; total: Totais; cat: Record<Categoria, Totais> }>();
  for (const t of titulos) {
    const p = periodo(t.vencimento, agrupar);
    if (!mapa.has(p.chave)) {
      mapa.set(p.chave, {
        rotulo: p.rotulo,
        total: vazio(),
        cat: { embalagem: vazio(), materia_prima: vazio(), frete: vazio(), outras: vazio() },
      });
    }
    const linha = mapa.get(p.chave)!;
    somar(linha.total, t);
    somar(linha.cat[categoria(t)], t);
  }
  return Array.from(mapa, ([chave, v]) => ({ chave, ...v })).sort((a, b) => a.chave.localeCompare(b.chave));
}

export function porCategoria(titulos: TituloCP[]): Record<Categoria, Totais> {
  const r: Record<Categoria, Totais> = { embalagem: vazio(), materia_prima: vazio(), frete: vazio(), outras: vazio() };
  titulos.forEach((t) => somar(r[categoria(t)], t));
  return r;
}

export function porConta(titulos: TituloCP[]) {
  const mapa = new Map<string, { contaPai: string; conta: string; total: Totais }>();
  for (const t of titulos) {
    const k = `${t.contaPai}|${t.conta}`;
    if (!mapa.has(k)) mapa.set(k, { contaPai: t.contaPai, conta: t.conta, total: vazio() });
    somar(mapa.get(k)!.total, t);
  }
  return Array.from(mapa.values()).sort((a, b) => b.total.valor - a.total.valor);
}

export function porFavorecido(titulos: TituloCP[]) {
  const mapa = new Map<string, { favorecido: string; categorias: Set<Categoria>; total: Totais }>();
  for (const t of titulos) {
    const k = t.favorecidoCod ?? t.favorecido;
    if (!mapa.has(k)) mapa.set(k, { favorecido: t.favorecido, categorias: new Set(), total: vazio() });
    const f = mapa.get(k)!;
    f.categorias.add(categoria(t));
    somar(f.total, t);
  }
  return Array.from(mapa.values()).sort((a, b) => b.total.valor - a.total.valor);
}

export function empresasDosTitulos(titulos: TituloCP[]) {
  return Array.from(new Map(titulos.map((t) => [t.empresaId, t.empresa])), ([id, nome]) => ({ id, nome })).sort((a, b) =>
    a.nome.localeCompare(b.nome)
  );
}

export function diasNoPeriodo(f: Filtros) {
  return Math.round((Date.parse(f.ate) - Date.parse(f.de)) / DIA) + 1;
}
