import sql from 'mssql';
import { getPool } from '@/lib/sqlserver';

/**
 * Aba NFE: notas fiscais lidas direto do ERP (WORK_NATUHAIR), só leitura.
 *
 * - Emitidas: fscNFCapa (uma por nota, Saida='X' = saída; Entrada='X' = nota de entrada
 *   emitida pela própria empresa), total em fscNFTotais (uma linha por nota) e o XML
 *   autorizado (nfeProc) em FscNFeXML.XmlTransacao.
 * - Entradas: Nota_entrada (notas de fornecedores lançadas), operação em CmpOP.
 * - Não lançadas: recNFe (XML recebido no ERP) sem Nota_entrada com a mesma chave.
 *   A lista completa da SEFAZ (fscNFeDestXML) e o XML das recebidas (fscRecNFeXml)
 *   ficam no banco WORK_NATUHAIR_EXTENSAO_2, que o usuário do ERP não acessa.
 * - Nome das empresas do grupo: cfgEmpresas.
 */

export type Aba = 'emitidas' | 'entradas' | 'chave' | 'naolancadas';
export const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'emitidas', rotulo: 'Emitidas' },
  { id: 'entradas', rotulo: 'Entradas' },
  { id: 'chave', rotulo: 'Consulta por chave' },
  { id: 'naolancadas', rotulo: 'Não lançadas' },
];

/** Linhas mostradas na tela. */
export const LIMITE_TELA = 500;
/** Máximo trazido do ERP numa consulta da tela e no Excel. */
export const LIMITE_CONSULTA = 2000;
export const LIMITE_EXCEL = 20000;
/** Sem busca e sem datas: as notas mais recentes. */
export const RECENTES = 200;

export interface Filtros {
  de: string; // '' = sem data inicial
  ate: string; // '' = sem data final
  empresa: string; // '' = todas
  busca: string; // número, nome, CNPJ ou chave
  situacao: '' | 'autorizada' | 'cancelada' | 'pendente'; // emitidas
  tipo: '' | 'saida' | 'entrada'; // emitidas
  cp: '' | 'sim' | 'nao'; // entradas: gerou conta a pagar?
}

export interface NotaEmitida {
  id: number;
  numero: string;
  serie: string;
  emissao: string;
  empresaId: string;
  tipo: 'saida' | 'entrada';
  natureza: string;
  destinatario: string;
  documento: string;
  uf: string;
  valor: number;
  chave: string;
  protocolo: string;
  autorizacao: string | null;
  situacao: 'autorizada' | 'cancelada' | 'pendente';
}

export interface NotaEntrada {
  id: number;
  numero: string;
  serie: string;
  emissao: string | null;
  lancamento: string | null;
  empresaId: string;
  fornecedor: string;
  cnpj: string;
  operacao: string;
  valor: number;
  geraCp: boolean;
  geradoCp: boolean;
  chave: string;
}

export interface NotaNaoLancada {
  id: number;
  numero: string;
  serie: string;
  emissao: string | null;
  recebimento: string | null;
  empresaId: string;
  fornecedor: string;
  cnpj: string;
  valor: number;
  status: string;
  chave: string;
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/** Datas são opcionais: a pessoa digita o que procura e a busca vale para todo o histórico. */
export function lerFiltros(sp: Record<string, string | string[] | undefined>): Filtros {
  const de = DATA.test(um(sp.de)) ? um(sp.de) : '';
  const ate = DATA.test(um(sp.ate)) ? um(sp.ate) : '';
  const situacao = um(sp.situacao);
  const tipo = um(sp.tipo);
  const cp = um(sp.cp);
  return {
    de,
    ate,
    empresa: /^\w{1,10}$/.test(um(sp.empresa)) ? um(sp.empresa) : '',
    busca: um(sp.busca).trim().slice(0, 80),
    situacao: (['autorizada', 'cancelada', 'pendente'].includes(situacao) ? situacao : '') as Filtros['situacao'],
    tipo: (['saida', 'entrada'].includes(tipo) ? tipo : '') as Filtros['tipo'],
    cp: (['sim', 'nao'].includes(cp) ? cp : '') as Filtros['cp'],
  };
}

export function filtrosParaUrl(f: Filtros, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, ...extra })) if (v) q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const periodoInvertido = (f: Pick<Filtros, 'de' | 'ate'>) => Boolean(f.de && f.ate && f.de > f.ate);
/** Sem busca e sem datas a tela mostra só as notas mais recentes. */
export const semFiltro = (f: Filtros) => !f.busca && !f.de && !f.ate;

/** Só dígitos; chave de NF-e tem 44. */
export function limparChave(s: string): string {
  return s.replace(/\D/g, '');
}

interface Colunas {
  data: string;
  empresa: string;
  numero: string;
  chave: string;
  nome: string;
  documento: string;
}

/**
 * Condições do WHERE para período, empresa e busca, feitas no banco para valer em todo o
 * histórico. A busca entende o que foi digitado: 44 números = chave; 11 ou 14 = CPF/CNPJ;
 * 8 = raiz do CNPJ ou número da nota; outros números = número da nota; texto = nome.
 */
function condicoes(req: sql.Request, f: Filtros, c: Colunas): string[] {
  const w: string[] = [];
  if (f.de) {
    req.input('de', sql.VarChar(10), f.de);
    w.push(`${c.data} >= CAST(@de AS date)`);
  }
  if (f.ate) {
    req.input('ate', sql.VarChar(10), f.ate);
    w.push(`${c.data} < DATEADD(day, 1, CAST(@ate AS date))`);
  }
  if (f.empresa) {
    req.input('empresa', sql.VarChar(10), f.empresa);
    w.push(`RTRIM(${c.empresa}) = @empresa`);
  }
  const b = f.busca;
  if (!b) return w;
  const digitos = limparChave(b);
  const docLimpo = `REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(${c.documento}, ''), '.', ''), '/', ''), '-', ''), ' ', '')`;
  const numero = `TRY_CAST(${c.numero} AS bigint) = @num`;
  if (/^[\d.\-/\s]+$/.test(b) && digitos) {
    if (digitos.length === 44) {
      req.input('chave', sql.VarChar(44), digitos);
      w.push(`${c.chave} = @chave`);
    } else if (digitos.length === 11 || digitos.length === 14) {
      req.input('doc', sql.VarChar(14), digitos);
      w.push(`${docLimpo} = @doc`);
    } else if (digitos.length === 8) {
      req.input('raiz', sql.VarChar(9), `${digitos}%`).input('num', sql.BigInt, Number(digitos));
      w.push(`(${docLimpo} LIKE @raiz OR ${numero})`);
    } else {
      req.input('num', sql.BigInt, Number(digitos.slice(0, 15)));
      w.push(numero);
    }
  } else {
    req.input('nome', sql.VarChar(90), `%${b}%`);
    w.push(`${c.nome} LIKE @nome`);
  }
  return w;
}

/** Quantas linhas trazer: só as recentes sem nenhum filtro; senão até o limite pedido. */
const topo = (f: Filtros, limite: number) => (semFiltro(f) ? RECENTES : limite);

let cacheEmpresas: { quando: number; nomes: Map<string, string> } | null = null;

/**
 * Nome curto de cada empresa do grupo ("BIOSENSE MATRIZ E1", "VENEZA (SP)"), o mesmo do
 * Contas a Pagar; cfgEmpresas só completa as que não têm movimento financeiro. Cache de 1 h.
 */
export async function nomesEmpresas(): Promise<Map<string, string>> {
  if (cacheEmpresas && Date.now() - cacheEmpresas.quando < 3_600_000) return cacheEmpresas.nomes;
  const pool = await getPool();
  const { recordset } = await pool.request().query(`
    SELECT RTRIM(EmpresaID) AS id, MAX(RTRIM(NomeEmpresa)) AS nome
    FROM dbo.vFinMovimentosCTB
    WHERE Vencimento >= DATEADD(year, -2, GETDATE()) AND ISNULL(NomeEmpresa, '') <> ''
    GROUP BY RTRIM(EmpresaID)
    UNION ALL
    SELECT RTRIM(EmpresaID), RTRIM(COALESCE(NULLIF(Nome, ''), RazaoSocial, EmpresaID))
    FROM dbo.cfgEmpresas
    WHERE EmpresaID IS NOT NULL`);
  const nomes = new Map<string, string>();
  for (const r of recordset) if (!nomes.has(String(r.id))) nomes.set(String(r.id), String(r.nome));
  cacheEmpresas = { quando: Date.now(), nomes };
  return nomes;
}

export async function buscarEmitidas(f: Filtros, limite = LIMITE_CONSULTA): Promise<NotaEmitida[]> {
  const pool = await getPool();
  const req = pool.request().input('limite', sql.Int, topo(f, limite));
  const w = condicoes(req, f, {
    data: 'c.Emissao',
    empresa: 'c.EmpresaID',
    numero: 'c.Numero',
    chave: 'c.ChaveNFE',
    nome: 'c.RazSoc',
    documento: 'c.CNPJ',
  });
  if (f.tipo === 'saida') w.push("c.Saida = 'X'");
  if (f.tipo === 'entrada') w.push("c.Entrada = 'X'");
  if (f.situacao === 'cancelada') w.push('c.Cancelada = 1');
  if (f.situacao === 'autorizada') w.push("c.Cancelada = 0 AND ISNULL(c.ProtocoloNFE, '') <> ''");
  if (f.situacao === 'pendente') w.push("c.Cancelada = 0 AND ISNULL(c.ProtocoloNFE, '') = ''");
  const { recordset } = await req.query(`
    SELECT TOP (@limite)
      c.fscNFID AS id, RTRIM(c.Numero) AS numero, RTRIM(ISNULL(c.Serie, '')) AS serie,
      CONVERT(varchar(10), c.Emissao, 23) AS emissao, RTRIM(c.EmpresaID) AS empresaId,
      CASE WHEN c.Entrada = 'X' THEN 'entrada' ELSE 'saida' END AS tipo,
      RTRIM(ISNULL(c.NaturezaOp, '')) AS natureza, RTRIM(ISNULL(c.RazSoc, '')) AS destinatario,
      RTRIM(ISNULL(c.CNPJ, '')) AS documento, RTRIM(ISNULL(c.Estado, '')) AS uf,
      CAST(ISNULL(t.ValorTotal, 0) AS float) AS valor,
      RTRIM(ISNULL(c.ChaveNFE, '')) AS chave, RTRIM(ISNULL(c.ProtocoloNFE, '')) AS protocolo,
      CONVERT(varchar(16), c.DataAutorizacaoNFE, 120) AS autorizacao, c.Cancelada AS cancelada
    FROM dbo.fscNFCapa c
    LEFT JOIN dbo.fscNFTotais t ON t.fscNFID = c.fscNFID
    ${w.length ? `WHERE ${w.join(' AND ')}` : ''}
    ORDER BY c.Emissao DESC, c.fscNFID DESC`);

  return recordset.map(
    (r): NotaEmitida => ({
      ...r,
      situacao: r.cancelada ? 'cancelada' : r.protocolo ? 'autorizada' : 'pendente',
    })
  );
}

export async function buscarEntradas(f: Filtros, limite = LIMITE_CONSULTA): Promise<NotaEntrada[]> {
  const pool = await getPool();
  const req = pool.request().input('limite', sql.Int, topo(f, limite));
  const w = condicoes(req, f, {
    data: 'n.DataCadastro',
    empresa: 'n.EmpresaID',
    numero: 'n.nota_fornecedor',
    chave: 'n.ChaveNFE',
    nome: 'COALESCE(NULLIF(n.ContRazSocForn, \'\'), c.ContRazSoc)',
    documento: 'n.ContCGCForn',
  });
  if (f.cp === 'sim') w.push('ISNULL(n.GeradoCP, 0) = 1');
  if (f.cp === 'nao') w.push('ISNULL(n.GeradoCP, 0) = 0');
  const { recordset } = await req.query(`
    SELECT TOP (@limite)
      n.nota AS id, CAST(n.nota_fornecedor AS varchar(20)) AS numero, RTRIM(ISNULL(n.serie_fornecedor, '')) AS serie,
      CONVERT(varchar(10), n.data, 23) AS emissao, CONVERT(varchar(10), n.DataCadastro, 23) AS lancamento,
      RTRIM(ISNULL(n.EmpresaID, '')) AS empresaId,
      RTRIM(COALESCE(NULLIF(n.ContRazSocForn, ''), c.ContRazSoc, n.fornecedor)) AS fornecedor,
      RTRIM(ISNULL(n.ContCGCForn, '')) AS cnpj,
      RTRIM(COALESCE(o.Descricao, n.CmpOpID, '')) AS operacao,
      CAST(ISNULL(n.total, 0) AS float) AS valor,
      CAST(ISNULL(n.GeraCP, 0) AS bit) AS geraCp, CAST(ISNULL(n.GeradoCP, 0) AS bit) AS geradoCp,
      RTRIM(ISNULL(n.ChaveNFE, '')) AS chave
    FROM dbo.Nota_entrada n
    LEFT JOIN dbo.Contas c ON c.ContaID = n.fornecedor
    LEFT JOIN dbo.CmpOP o ON o.CmpOpID = n.CmpOpID
    WHERE n.status <> 'CA' ${w.map((c) => `AND ${c}`).join(' ')}
    ORDER BY n.DataCadastro DESC, n.nota DESC`);

  return recordset as NotaEntrada[];
}

export async function buscarNaoLancadas(f: Filtros, limite = LIMITE_CONSULTA): Promise<NotaNaoLancada[]> {
  const pool = await getPool();
  // Poucas notas: aqui sem filtro vale o limite normal, não só as recentes.
  const req = pool.request().input('limite', sql.Int, limite);
  const w = condicoes(req, f, {
    data: 'r.Data',
    empresa: 'r.EmpresaID',
    numero: 'r.Nota',
    chave: 'r.ChaveNota',
    nome: 'r.RazSocForn',
    documento: 'r.FornecedorCNPJ',
  });
  const { recordset } = await req.query(`
    SELECT TOP (@limite)
      r.recNFeID AS id, RTRIM(ISNULL(r.Nota, '')) AS numero, RTRIM(ISNULL(r.Serie, '')) AS serie,
      CONVERT(varchar(10), r.Data, 23) AS emissao, CONVERT(varchar(16), r.DataProcessamento, 120) AS recebimento,
      RTRIM(ISNULL(r.EmpresaID, '')) AS empresaId, RTRIM(ISNULL(r.RazSocForn, '')) AS fornecedor,
      RTRIM(ISNULL(r.FornecedorCNPJ, '')) AS cnpj, CAST(ISNULL(r.TotalNota, 0) AS float) AS valor,
      RTRIM(ISNULL(r.Status, '')) AS status, RTRIM(ISNULL(r.ChaveNota, '')) AS chave
    FROM dbo.recNFe r
    WHERE ISNULL(r.ChaveNota, '') <> ''
      AND NOT EXISTS (SELECT 1 FROM dbo.Nota_entrada ne WHERE ne.ChaveNFE = r.ChaveNota AND ne.status <> 'CA')
      ${w.map((c) => `AND ${c}`).join(' ')}
    ORDER BY r.Data DESC`);
  return recordset as NotaNaoLancada[];
}

export interface ResultadoChave {
  emitidas: NotaEmitida[];
  entradas: NotaEntrada[];
  recebidas: NotaNaoLancada[];
}

/** Procura a chave nas notas emitidas, nas entradas e no recebimento de XML do ERP. */
export async function buscarPorChave(chave: string): Promise<ResultadoChave> {
  const pool = await getPool();
  const [emit, ent, rec] = await Promise.all([
    pool.request().input('chave', sql.VarChar(44), chave).query(`
      SELECT c.fscNFID AS id, RTRIM(c.Numero) AS numero, RTRIM(ISNULL(c.Serie, '')) AS serie,
        CONVERT(varchar(10), c.Emissao, 23) AS emissao, RTRIM(c.EmpresaID) AS empresaId,
        CASE WHEN c.Entrada = 'X' THEN 'entrada' ELSE 'saida' END AS tipo,
        RTRIM(ISNULL(c.NaturezaOp, '')) AS natureza, RTRIM(ISNULL(c.RazSoc, '')) AS destinatario,
        RTRIM(ISNULL(c.CNPJ, '')) AS documento, RTRIM(ISNULL(c.Estado, '')) AS uf,
        CAST(ISNULL(t.ValorTotal, 0) AS float) AS valor, RTRIM(c.ChaveNFE) AS chave,
        RTRIM(ISNULL(c.ProtocoloNFE, '')) AS protocolo, CONVERT(varchar(16), c.DataAutorizacaoNFE, 120) AS autorizacao,
        c.Cancelada AS cancelada
      FROM dbo.fscNFCapa c LEFT JOIN dbo.fscNFTotais t ON t.fscNFID = c.fscNFID
      WHERE c.ChaveNFE = @chave`),
    pool.request().input('chave', sql.VarChar(44), chave).query(`
      SELECT n.nota AS id, CAST(n.nota_fornecedor AS varchar(20)) AS numero, RTRIM(ISNULL(n.serie_fornecedor, '')) AS serie,
        CONVERT(varchar(10), n.data, 23) AS emissao, CONVERT(varchar(10), n.DataCadastro, 23) AS lancamento,
        RTRIM(ISNULL(n.EmpresaID, '')) AS empresaId,
        RTRIM(COALESCE(NULLIF(n.ContRazSocForn, ''), n.fornecedor)) AS fornecedor, RTRIM(ISNULL(n.ContCGCForn, '')) AS cnpj,
        RTRIM(COALESCE(o.Descricao, n.CmpOpID, '')) AS operacao, CAST(ISNULL(n.total, 0) AS float) AS valor,
        CAST(ISNULL(n.GeraCP, 0) AS bit) AS geraCp, CAST(ISNULL(n.GeradoCP, 0) AS bit) AS geradoCp, RTRIM(n.ChaveNFE) AS chave
      FROM dbo.Nota_entrada n LEFT JOIN dbo.CmpOP o ON o.CmpOpID = n.CmpOpID
      WHERE n.ChaveNFE = @chave AND n.status <> 'CA'`),
    pool.request().input('chave', sql.VarChar(44), chave).query(`
      SELECT r.recNFeID AS id, RTRIM(ISNULL(r.Nota, '')) AS numero, RTRIM(ISNULL(r.Serie, '')) AS serie,
        CONVERT(varchar(10), r.Data, 23) AS emissao, CONVERT(varchar(16), r.DataProcessamento, 120) AS recebimento,
        RTRIM(ISNULL(r.EmpresaID, '')) AS empresaId, RTRIM(ISNULL(r.RazSocForn, '')) AS fornecedor,
        RTRIM(ISNULL(r.FornecedorCNPJ, '')) AS cnpj, CAST(ISNULL(r.TotalNota, 0) AS float) AS valor,
        RTRIM(ISNULL(r.Status, '')) AS status, RTRIM(r.ChaveNota) AS chave
      FROM dbo.recNFe r WHERE r.ChaveNota = @chave`),
  ]);
  return {
    emitidas: emit.recordset.map((r) => ({ ...r, situacao: r.cancelada ? 'cancelada' : r.protocolo ? 'autorizada' : 'pendente' })),
    entradas: ent.recordset,
    recebidas: rec.recordset,
  };
}

/** XML autorizado (nfeProc) de uma nota emitida, pela chave; null se o ERP não guardou. */
export async function xmlEmitida(chave: string): Promise<string | null> {
  const pool = await getPool();
  const { recordset } = await pool.request().input('chave', sql.VarChar(44), chave).query(`
    SELECT TOP 1 x.XmlTransacao AS xml
    FROM dbo.fscNFCapa c JOIN dbo.FscNFeXML x ON x.fscnfid = c.fscNFID
    WHERE c.ChaveNFE = @chave AND x.XmlTransacao LIKE '%<protNFe%'`);
  return recordset[0]?.xml ?? null;
}
