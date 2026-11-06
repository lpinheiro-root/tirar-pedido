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

export const MAX_DIAS = 93;
export const LIMITE_TELA = 500;

export interface Filtros {
  de: string;
  ate: string;
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

const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export function lerFiltros(sp: Record<string, string | string[] | undefined>): Filtros {
  const hoje = hojeSP();
  const de = DATA.test(um(sp.de)) ? um(sp.de) : `${hoje.slice(0, 7)}-01`;
  const ate = DATA.test(um(sp.ate)) ? um(sp.ate) : hoje;
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

export function diasNoPeriodo(f: Pick<Filtros, 'de' | 'ate'>): number {
  return Math.round((Date.parse(f.ate) - Date.parse(f.de)) / 86_400_000) + 1;
}

/** Só dígitos; chave de NF-e tem 44. */
export function limparChave(s: string): string {
  return s.replace(/\D/g, '');
}

const semAcento = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Busca livre por número, nome, CNPJ/CPF ou chave (feita aqui, depois da consulta do período). */
function bate(busca: string, ...campos: string[]): boolean {
  if (!busca) return true;
  const termo = semAcento(busca);
  const digitos = limparChave(busca);
  return campos.some((c) => semAcento(c).includes(termo) || (digitos.length >= 3 && limparChave(c).includes(digitos)));
}

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

export async function buscarEmitidas(f: Filtros): Promise<NotaEmitida[]> {
  const pool = await getPool();
  const req = pool.request().input('de', sql.VarChar(10), f.de).input('ate', sql.VarChar(10), f.ate);
  const extras: string[] = [];
  if (f.empresa) {
    req.input('empresa', sql.VarChar(10), f.empresa);
    extras.push('AND RTRIM(c.EmpresaID) = @empresa');
  }
  if (f.tipo === 'saida') extras.push("AND c.Saida = 'X'");
  if (f.tipo === 'entrada') extras.push("AND c.Entrada = 'X'");
  const { recordset } = await req.query(`
    SELECT
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
    WHERE c.Emissao >= CAST(@de AS date) AND c.Emissao < DATEADD(day, 1, CAST(@ate AS date))
      ${extras.join(' ')}
    ORDER BY c.Emissao DESC, c.fscNFID DESC`);

  return recordset
    .map(
      (r): NotaEmitida => ({
        ...r,
        situacao: r.cancelada ? 'cancelada' : r.protocolo ? 'autorizada' : 'pendente',
      })
    )
    .filter((n) => (!f.situacao || n.situacao === f.situacao) && bate(f.busca, n.numero, n.destinatario, n.documento, n.chave));
}

export async function buscarEntradas(f: Filtros): Promise<NotaEntrada[]> {
  const pool = await getPool();
  const req = pool.request().input('de', sql.VarChar(10), f.de).input('ate', sql.VarChar(10), f.ate);
  const extras: string[] = [];
  if (f.empresa) {
    req.input('empresa', sql.VarChar(10), f.empresa);
    extras.push('AND RTRIM(n.EmpresaID) = @empresa');
  }
  const { recordset } = await req.query(`
    SELECT
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
    WHERE n.status <> 'CA'
      AND n.DataCadastro >= CAST(@de AS date) AND n.DataCadastro < DATEADD(day, 1, CAST(@ate AS date))
      ${extras.join(' ')}
    ORDER BY n.DataCadastro DESC, n.nota DESC`);

  return (recordset as NotaEntrada[]).filter(
    (n) =>
      (!f.cp || (f.cp === 'sim' ? n.geradoCp : !n.geradoCp)) && bate(f.busca, n.numero, n.fornecedor, n.cnpj, n.chave, n.operacao)
  );
}

export async function buscarNaoLancadas(f: Filtros): Promise<NotaNaoLancada[]> {
  const pool = await getPool();
  const req = pool.request().input('de', sql.VarChar(10), f.de).input('ate', sql.VarChar(10), f.ate);
  const extras: string[] = [];
  if (f.empresa) {
    req.input('empresa', sql.VarChar(10), f.empresa);
    extras.push('AND RTRIM(r.EmpresaID) = @empresa');
  }
  const { recordset } = await req.query(`
    SELECT
      r.recNFeID AS id, RTRIM(ISNULL(r.Nota, '')) AS numero, RTRIM(ISNULL(r.Serie, '')) AS serie,
      CONVERT(varchar(10), r.Data, 23) AS emissao, CONVERT(varchar(16), r.DataProcessamento, 120) AS recebimento,
      RTRIM(ISNULL(r.EmpresaID, '')) AS empresaId, RTRIM(ISNULL(r.RazSocForn, '')) AS fornecedor,
      RTRIM(ISNULL(r.FornecedorCNPJ, '')) AS cnpj, CAST(ISNULL(r.TotalNota, 0) AS float) AS valor,
      RTRIM(ISNULL(r.Status, '')) AS status, RTRIM(ISNULL(r.ChaveNota, '')) AS chave
    FROM dbo.recNFe r
    WHERE r.Data >= CAST(@de AS date) AND r.Data < DATEADD(day, 1, CAST(@ate AS date))
      AND ISNULL(r.ChaveNota, '') <> ''
      AND NOT EXISTS (SELECT 1 FROM dbo.Nota_entrada ne WHERE ne.ChaveNFE = r.ChaveNota AND ne.status <> 'CA')
      ${extras.join(' ')}
    ORDER BY r.Data DESC`);
  return (recordset as NotaNaoLancada[]).filter((n) => bate(f.busca, n.numero, n.fornecedor, n.cnpj, n.chave));
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
