import sql from 'mssql';
import { getPool } from '@/lib/sqlserver';

/**
 * Carteira FIDC: confere se cada título do borderô já está, no ORGM (WORK_NATUHAIR), na
 * carteira da FIDC que comprou. Só leitura no ERP.
 *
 * - O título fica em FinMovimentos (Tipo 'CR'); a carteira é ContaPrevPgto, que aponta para
 *   uma conta em Contas ("GOAL VENEZA RJ", "AMPLIC ROMA AG ...", "LECCA FIDC ROMA";
 *   "CARTEIRA" = ainda não foi vendido).
 * - Número do título no borderô → Documento no ORGM: "37975-001" = "37975/1" (Amplic, Crescer,
 *   Lecca); "844601" = "8446/1" (Goal: os dois últimos dígitos são a parcela).
 */

export type Situacao = 'ok' | 'falta' | 'outra' | 'nao_achado';

export interface TituloConferido {
  ordem: number;
  numero: string; // como está no borderô
  sacado: string;
  vencimento: string | null;
  valor: number;
  situacao: Situacao;
  documento: string | null; // no ORGM
  empresaId: string | null;
  carteiraCod: string | null;
  carteira: string | null;
  vencimentoOrgm: string | null;
  valorOrgm: number | null;
  pago: number;
  avisos: string[];
}

export interface TituloBordero {
  ordem: number;
  numero: string;
  sacado: string | null;
  vencimento: string | null;
  valor: number;
}

const semAcento = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
const limpo = (s: string) => semAcento(s).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Palavras que identificam a FIDC no nome da carteira do ORGM. */
const FIDC_NA_CARTEIRA: Record<string, string[]> = {
  Lecca: ['LECCA', 'RIVO'],
  Prévia: ['PREVIA'],
};
const palavrasFidc = (fidc: string) => FIDC_NA_CARTEIRA[fidc] ?? [limpo(fidc)];
/** "Veneza RJ" → "VENEZA RJ"; "Roma" → "ROMA". */
const palavrasEmpresa = (empresa: string) => limpo(empresa);

/** A carteira é desta FIDC e desta empresa? ("GOAL VENEZA RJ", "LECCA FIDC ROMA", "AMPLIC ROMA AG 36455 ...") */
export function carteiraDaFidc(nomeCarteira: string, fidc: string, empresa: string) {
  const n = ` ${limpo(nomeCarteira)} `;
  const temFidc = palavrasFidc(fidc).some((p) => n.includes(` ${p} `));
  const emp = palavrasEmpresa(empresa);
  // "VENEZA" sozinho (sem filial) aceita qualquer filial
  const temEmpresa = n.includes(` ${emp} `) || (emp === 'VENEZA' && n.includes(' VENEZA '));
  return temFidc && temEmpresa;
}

/** Documentos possíveis no ORGM para o número do borderô (mais provável primeiro). */
export function documentosPossiveis(numero: string): string[] {
  const n = numero.trim();
  const m = n.match(/^(\d+)[-/](\d+)$/);
  if (m) return [`${Number(m[1])}/${Number(m[2])}`];
  if (/^\d+$/.test(n)) {
    const r: string[] = [];
    for (const p of [2, 1, 3]) if (n.length > p) r.push(`${Number(n.slice(0, -p))}/${Number(n.slice(-p))}`);
    r.push(n);
    return Array.from(new Set(r));
  }
  return [n];
}

interface LinhaOrgm {
  FinMovID: number;
  EmpresaID: string;
  Documento: string;
  Vencimento: string | null;
  ValorOriginal: number;
  ValorPago: number;
  Carteira: string | null;
  CarteiraNome: string | null;
  Cnpj: string | null;
}

const digitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

export async function conferirTitulos(
  titulos: TituloBordero[],
  fidc: string,
  empresa: string,
  cnpjCedente: string
): Promise<TituloConferido[]> {
  if (!titulos.length) return [];
  const docs = Array.from(new Set(titulos.flatMap((t) => documentosPossiveis(t.numero))));
  // a conexão com o ORGM às vezes cai por um instante: tenta de novo antes de desistir
  const pool = await getPool().catch(async () => {
    await new Promise((r) => setTimeout(r, 1500));
    return getPool();
  });
  const linhas: LinhaOrgm[] = [];
  // em blocos para não passar do limite de parâmetros do SQL Server
  for (let i = 0; i < docs.length; i += 500) {
    const req = pool.request();
    const nomes = docs.slice(i, i + 500).map((d, j) => {
      req.input(`d${j}`, sql.VarChar(30), d);
      return `@d${j}`;
    });
    const { recordset } = await req.query(`
      SELECT f.FinMovID, RTRIM(f.EmpresaID) AS EmpresaID, RTRIM(f.Documento) AS Documento,
        CONVERT(char(10), f.Vencimento, 23) AS Vencimento, ISNULL(f.ValorOriginal, 0) AS ValorOriginal,
        ISNULL(f.ValorPago, 0) AS ValorPago, RTRIM(f.ContaPrevPgto) AS Carteira, RTRIM(c.ContRazSoc) AS CarteiraNome,
        RTRIM(e.CNPJ) AS Cnpj
      FROM dbo.FinMovimentos f
      LEFT JOIN dbo.Contas c ON RTRIM(c.ContaID) = RTRIM(f.ContaPrevPgto)
      LEFT JOIN dbo.cfgEmpresas e ON RTRIM(e.EmpresaID) = RTRIM(f.EmpresaID)
      WHERE f.Tipo = 'CR' AND ISNULL(f.Cancelado, 0) = 0 AND RTRIM(f.Documento) IN (${nomes.join(',')})`);
    linhas.push(...(recordset as LinhaOrgm[]));
  }

  const cnpj = digitos(cnpjCedente);
  return titulos.map((t) => {
    const possiveis = documentosPossiveis(t.numero);
    // candidatos na ordem dos documentos possíveis; entre eles, prefere a empresa do cedente e o mesmo valor
    const candidatos = possiveis.flatMap((d) => linhas.filter((l) => l.Documento === d));
    const nota = (l: LinhaOrgm) =>
      (cnpj && digitos(l.Cnpj) === cnpj ? 4 : 0) +
      (Math.abs(Number(l.ValorOriginal) - t.valor) < 0.05 ? 2 : 0) +
      (l.Vencimento === t.vencimento ? 1 : 0);
    const achado = candidatos.sort((a, b) => nota(b) - nota(a))[0];
    // só aceita se bater empresa ou valor (número igual de outra empresa e outro valor não é o mesmo título)
    if (!achado || nota(achado) < 2) {
      return {
        ...base(t),
        situacao: 'nao_achado' as const,
        avisos: candidatos.length ? ['Há documento com esse número no ORGM, mas de outra empresa e outro valor.'] : [],
      };
    }
    const avisos: string[] = [];
    if (Math.abs(Number(achado.ValorOriginal) - t.valor) >= 0.05) avisos.push('Valor diferente do borderô.');
    if (achado.Vencimento && t.vencimento && achado.Vencimento !== t.vencimento) avisos.push('Vencimento diferente do borderô.');
    if (Number(achado.ValorPago) > 0) avisos.push('Já tem pagamento no ORGM.');
    const nome = achado.CarteiraNome ?? '';
    const situacao: Situacao = carteiraDaFidc(nome, fidc, empresa)
      ? 'ok'
      : !achado.Carteira || /^CARTEIRA$/i.test(nome.trim())
        ? 'falta'
        : 'outra';
    return {
      ...base(t),
      situacao,
      documento: achado.Documento,
      empresaId: achado.EmpresaID,
      carteiraCod: achado.Carteira,
      carteira: nome || null,
      vencimentoOrgm: achado.Vencimento,
      valorOrgm: Number(achado.ValorOriginal),
      pago: Number(achado.ValorPago),
      avisos,
    };
  });
}

function base(t: TituloBordero): TituloConferido {
  return {
    ordem: t.ordem,
    numero: t.numero,
    sacado: t.sacado ?? '',
    vencimento: t.vencimento,
    valor: Number(t.valor),
    situacao: 'nao_achado',
    documento: null,
    empresaId: null,
    carteiraCod: null,
    carteira: null,
    vencimentoOrgm: null,
    valorOrgm: null,
    pago: 0,
    avisos: [],
  };
}

export interface ResumoConferencia {
  total: number;
  ok: number;
  falta: number;
  outra: number;
  naoAchado: number;
  avisos: number;
}

export function resumir(ts: TituloConferido[]): ResumoConferencia {
  return {
    total: ts.length,
    ok: ts.filter((t) => t.situacao === 'ok').length,
    falta: ts.filter((t) => t.situacao === 'falta').length,
    outra: ts.filter((t) => t.situacao === 'outra').length,
    naoAchado: ts.filter((t) => t.situacao === 'nao_achado').length,
    avisos: ts.filter((t) => t.avisos.length).length,
  };
}
