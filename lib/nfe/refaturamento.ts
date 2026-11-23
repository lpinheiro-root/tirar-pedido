import fs from 'fs/promises';
import path from 'path';
import sql from 'mssql';
import { getPool } from '@/lib/sqlserver';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { Filtros, NotaEmitida } from './dados';

/**
 * Refaturamentos: o ERP não tem campo para isso. O faturamento escreve nas informações
 * complementares da nota nova "REFATURAMENTO REFERENTE A NF 8272" (ou "REF A NF",
 * "REF. A NF", às vezes com erro de digitação, "REFATURAMENNTO"). Procurar esse texto em
 * todos os XMLs leva minutos, então o resultado fica num índice em disco
 * (.cache/refaturamentos.json): na primeira vez ele é montado aos poucos (por faixa de
 * fscNFID, com tempo limite por consulta) e depois só as notas novas são lidas.
 * Situação, valor e destinatário vêm sempre do ERP na hora.
 */

const ARQUIVO = path.join(process.cwd(), '.cache', 'refaturamentos.json');
/** O índice começa nas notas de 2025. */
const DESDE = '2025-01-01';
/** Faixa de fscNFID lida por consulta na montagem inicial. */
const FAIXA = 4_000;
/** Tempo máximo gasto montando o índice numa abertura da tela. */
const ORCAMENTO_MS = 25_000;

interface ItemIndice {
  id: number; // fscNFID da nota nova (a refaturada)
  refs: string[]; // números das notas originais citadas no texto
  texto: string; // trecho das informações complementares
}

interface Indice {
  inicio: number; // primeiro fscNFID do índice
  ultimoId: number; // até onde já foi lido
  itens: ItemIndice[];
}

/** Devolução da nota original: entrada emitida pela empresa (ERP) ou NFD emitida pelo cliente. */
export interface DevolucaoOriginal {
  numero: string;
  emissao: string;
  valor: number;
  origem: 'empresa' | 'cliente';
  cancelada: boolean;
  chave: string;
}

export type NotaOriginal = NotaEmitida & { devolucoes: DevolucaoOriginal[] };

export interface Refaturamento {
  nova: NotaEmitida;
  /** Números citados no texto ("NF 8272"). */
  refs: string[];
  /** Notas originais achadas no ERP (mesma empresa e número, emitidas antes da nova). */
  originais: NotaOriginal[];
  texto: string;
}

export interface ResultadoRefaturamento {
  itens: Refaturamento[];
  /** 0–100 enquanto o índice inicial ainda está sendo montado. */
  progresso: number | null;
}

const COLUNAS = `
  c.fscNFID AS id, RTRIM(c.Numero) AS numero, RTRIM(ISNULL(c.Serie, '')) AS serie,
  CONVERT(varchar(10), c.Emissao, 23) AS emissao, RTRIM(c.EmpresaID) AS empresaId,
  CASE WHEN c.Entrada = 'X' THEN 'entrada' ELSE 'saida' END AS tipo,
  RTRIM(ISNULL(c.NaturezaOp, '')) AS natureza, RTRIM(ISNULL(c.RazSoc, '')) AS destinatario,
  RTRIM(ISNULL(c.CNPJ, '')) AS documento, RTRIM(ISNULL(c.Estado, '')) AS uf,
  CAST(ISNULL(t.ValorTotal, 0) AS float) AS valor, RTRIM(ISNULL(c.ChaveNFE, '')) AS chave,
  RTRIM(ISNULL(c.ProtocoloNFE, '')) AS protocolo, CONVERT(varchar(16), c.DataAutorizacaoNFE, 120) AS autorizacao,
  c.Cancelada AS cancelada`;

const comSituacao = (r: NotaEmitida & { cancelada: boolean }): NotaEmitida => ({
  ...r,
  situacao: r.cancelada ? 'cancelada' : r.protocolo ? 'autorizada' : 'pendente',
});

/**
 * Números das notas citadas depois de "REFAT...": "REF A NF 37005 . PEDIDO 34600" → ["37005"];
 * "REF. NFS 100, 101 E 102" → ["100", "101", "102"].
 */
export function numerosCitados(texto: string): string[] {
  const t = texto.toUpperCase();
  const m = t.match(/REFAT[\s\S]*?\bN\.?\s?F[-A-Z.]*\s*(?:N[º°O.]*\s*)?:?\s*(\d[\d\s,E/.;-]*)/);
  if (!m) return [];
  return Array.from(new Set((m[1].match(/\d{2,}/g) ?? []).map((n) => String(Number(n)))));
}

async function lerIndice(): Promise<Indice | null> {
  try {
    return JSON.parse(await fs.readFile(ARQUIVO, 'utf8')) as Indice;
  } catch {
    return null;
  }
}

async function gravarIndice(indice: Indice) {
  await fs.mkdir(path.dirname(ARQUIVO), { recursive: true });
  await fs.writeFile(`${ARQUIVO}.tmp`, JSON.stringify(indice));
  await fs.rename(`${ARQUIVO}.tmp`, ARQUIVO);
}

/** Lê os XMLs com "REFAT" na faixa (de, ate] de fscNFID. */
async function lerFaixa(pool: sql.ConnectionPool, de: number, ate: number): Promise<ItemIndice[]> {
  const { recordset } = await pool
    .request()
    .input('de', sql.Int, de)
    .input('ate', sql.Int, ate)
    .query(`
      SELECT x.fscnfid AS id, SUBSTRING(x.XmlTransacao, CHARINDEX('<infCpl>', x.XmlTransacao) + 8, 600) AS cpl
      FROM dbo.FscNFeXML x
      WHERE x.fscnfid > @de AND x.fscnfid <= @ate AND x.XmlTransacao LIKE '%REFAT%'`);
  return recordset
    .map((r) => {
      const texto = String(r.cpl ?? '').split('</infCpl>')[0].replace(/\s+/g, ' ').trim();
      return { id: Number(r.id), refs: numerosCitados(texto), texto: texto.slice(0, 300) };
    })
    .filter((i) => /REFAT/i.test(i.texto));
}

/**
 * Devoluções de cada nota original (pela chave):
 * - entrada de devolução emitida pela empresa no ERP, que cita a original (FscNFReferenciadas);
 * - NFD emitida pelo cliente, lida do NF-Stock (cartao_notas, aba NF-e Recebidas).
 */
async function devolucoesDasOriginais(pool: sql.ConnectionPool, chaves: string[]): Promise<Map<string, DevolucaoOriginal[]>> {
  const mapa = new Map<string, DevolucaoOriginal[]>();
  const unicas = Array.from(new Set(chaves.filter((c) => /^\d{44}$/.test(c))));
  if (!unicas.length) return mapa;
  const add = (ref: string, d: DevolucaoOriginal) => {
    const lista = mapa.get(ref) ?? [];
    if (!lista.some((x) => (x.chave && x.chave === d.chave) || (x.numero === d.numero && x.emissao === d.emissao))) lista.push(d);
    mapa.set(ref, lista);
  };

  for (let i = 0; i < unicas.length; i += 500) {
    const lote = unicas.slice(i, i + 500);
    const { recordset } = await pool.request().query(`
      SELECT RTRIM(r.ChaveNFE) AS ref, RTRIM(c.Numero) AS numero, CONVERT(varchar(10), c.Emissao, 23) AS emissao,
        CAST(ISNULL(t.ValorTotal, 0) AS float) AS valor, c.Cancelada AS cancelada, RTRIM(ISNULL(c.ChaveNFE, '')) AS chave
      FROM dbo.FscNFReferenciadas r
      JOIN dbo.fscNFCapa c ON c.fscNFID = r.fscNFId
      LEFT JOIN dbo.fscNFTotais t ON t.fscNFID = c.fscNFID
      WHERE RTRIM(r.ChaveNFE) IN (${lote.map((c) => `'${c}'`).join(',')}) AND UPPER(c.NaturezaOp) LIKE '%DEVOLU%'`);
    for (const r of recordset) add(r.ref, { ...r, cancelada: Boolean(r.cancelada), origem: 'empresa' });
  }

  try {
    const { data } = await createServiceRoleClient()
      .from('cartao_notas')
      .select('chave, data_emissao, valor_total, situacao, devolucao_origem, notas_origem')
      .eq('tipo', 'devolucao')
      .overlaps('notas_origem', unicas);
    for (const d of data ?? []) {
      for (const ref of (d.notas_origem as string[]).filter((c) => unicas.includes(c))) {
        add(ref, {
          numero: String(Number(String(d.chave).slice(25, 34))),
          emissao: new Date(d.data_emissao).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }),
          valor: Number(d.valor_total ?? 0),
          origem: d.devolucao_origem === 'cliente' ? 'cliente' : 'empresa',
          cancelada: d.situacao === 'cancelada',
          chave: d.chave,
        });
      }
    }
  } catch (e) {
    console.error('[refaturamento] NFD do NF-Stock', e);
  }
  for (const lista of Array.from(mapa.values())) lista.sort((a, b) => a.emissao.localeCompare(b.emissao));
  return mapa;
}

let emAndamento: Promise<Indice> | null = null;

/** Atualiza o índice: monta aos poucos na primeira vez; depois lê só as notas novas. */
async function atualizarIndice(): Promise<Indice> {
  const pool = await getPool();
  let indice = await lerIndice();
  if (!indice) {
    const { recordset } = await pool.request().input('d', sql.VarChar(10), DESDE).query(`SELECT MIN(fscNFID) AS id FROM dbo.fscNFCapa WHERE Emissao >= CAST(@d AS date)`);
    const inicio = Number(recordset[0]?.id ?? 0) - 1;
    indice = { inicio, ultimoId: inicio, itens: [] };
  }
  const { recordset: mx } = await pool.request().query(`SELECT MAX(fscnfid) AS id FROM dbo.FscNFeXML`);
  const maximo = Number(mx[0]?.id ?? indice.ultimoId);
  const comeco = Date.now();
  while (indice.ultimoId < maximo && Date.now() - comeco < ORCAMENTO_MS) {
    const ate = Math.min(indice.ultimoId + FAIXA, maximo);
    const novos = await lerFaixa(pool, indice.ultimoId, ate);
    const ids = new Set(novos.map((n) => n.id));
    indice = { ...indice, ultimoId: ate, itens: [...indice.itens.filter((i) => !ids.has(i.id)), ...novos] };
    await gravarIndice(indice);
  }
  return indice;
}

/** Notas refaturadas, com a nota original de cada uma, filtradas como a tela pede. */
export async function buscarRefaturamentos(f: Filtros): Promise<ResultadoRefaturamento> {
  emAndamento ??= atualizarIndice().finally(() => (emAndamento = null));
  const indice = await emAndamento;
  const pool = await getPool();
  const { recordset: mx } = await pool.request().query(`SELECT MAX(fscnfid) AS id FROM dbo.FscNFeXML`);
  const maximo = Number(mx[0]?.id ?? indice.ultimoId);
  const faltando = maximo - indice.ultimoId;
  const progresso =
    faltando > FAIXA ? Math.floor(((indice.ultimoId - indice.inicio) / Math.max(1, maximo - indice.inicio)) * 100) : null;

  if (!indice.itens.length) return { itens: [], progresso };

  // notas novas (capa do ERP)
  const ids = indice.itens.map((i) => i.id);
  const { recordset: novas } = await pool.request().query(`
    SELECT ${COLUNAS} FROM dbo.fscNFCapa c LEFT JOIN dbo.fscNFTotais t ON t.fscNFID = c.fscNFID
    WHERE c.fscNFID IN (${ids.join(',')})`);
  const porId = new Map<number, NotaEmitida>(novas.map((r) => [Number(r.id), comSituacao(r)]));

  // candidatas a nota original: mesmos números, emitidas a partir de 2024
  const numeros = Array.from(new Set(indice.itens.flatMap((i) => i.refs))).map(Number).filter((n) => n > 0 && n < 1e12);
  const candidatas: NotaEmitida[] = [];
  for (let i = 0; i < numeros.length; i += 500) {
    const lote = numeros.slice(i, i + 500);
    const { recordset } = await pool.request().query(`
      SELECT ${COLUNAS} FROM dbo.fscNFCapa c LEFT JOIN dbo.fscNFTotais t ON t.fscNFID = c.fscNFID
      WHERE c.Emissao >= '2024-01-01' AND c.Saida = 'X' AND TRY_CAST(c.Numero AS bigint) IN (${lote.join(',')})`);
    candidatas.push(...recordset.map(comSituacao));
  }

  const ligados: { nova: NotaEmitida; refs: string[]; originais: NotaEmitida[]; texto: string }[] = [];
  for (const item of indice.itens) {
    const nova = porId.get(item.id);
    if (!nova) continue;
    const originais = item.refs.flatMap((ref) => {
      const mesmas = candidatas.filter((c) => c.numero.replace(/^0+/, '') === ref && c.id !== nova.id && c.emissao <= nova.emissao);
      // a mesma empresa primeiro; senão, o mesmo cliente
      const daEmpresa = mesmas.filter((c) => c.empresaId === nova.empresaId);
      const doCliente = mesmas.filter((c) => c.documento && c.documento === nova.documento);
      const escolha = daEmpresa.length ? daEmpresa : doCliente;
      // a mais recente antes da nova
      return escolha.sort((a, b) => b.emissao.localeCompare(a.emissao) || b.id - a.id).slice(0, 1);
    });
    ligados.push({ nova, refs: item.refs, originais, texto: item.texto });
  }

  const devolucoes = await devolucoesDasOriginais(
    pool,
    ligados.flatMap((l) => l.originais.map((o) => o.chave)).filter((c) => c.length === 44)
  );
  const itens: Refaturamento[] = ligados.map((l) => ({
    ...l,
    originais: l.originais.map((o) => ({ ...o, devolucoes: devolucoes.get(o.chave) ?? [] })),
  }));

  const b = f.busca.trim();
  const digitos = b.replace(/\D/g, '');
  const filtrados = itens.filter(({ nova, originais, refs }) => {
    if (f.de && nova.emissao < f.de) return false;
    if (f.ate && nova.emissao > f.ate) return false;
    if (f.empresa && nova.empresaId !== f.empresa) return false;
    if (!b) return true;
    if (/^[\d.\-/\s]+$/.test(b) && digitos) {
      const n = String(Number(digitos));
      const doc = nova.documento.replace(/\D/g, '');
      return nova.numero.replace(/^0+/, '') === n || refs.includes(n) || (digitos.length >= 8 && doc.startsWith(digitos));
    }
    const nome = b.toUpperCase();
    return nova.destinatario.toUpperCase().includes(nome) || originais.some((o) => o.destinatario.toUpperCase().includes(nome));
  });
  filtrados.sort((a, z) => z.nova.emissao.localeCompare(a.nova.emissao) || z.nova.id - a.nova.id);
  return { itens: filtrados, progresso };
}
