import * as XLSX from 'xlsx';
import { MARCAS } from './conciliacao';

/**
 * Importação de compras por planilha (.xlsx/.csv) para sites sem API de
 * comprador (Shopee, Magalu, Amazon...). Os nomes de coluna são flexíveis:
 * Data | Site | Loja | Descrição | Valor | Parcelas | Pedido
 */

export interface CompraImportada {
  origem: string;
  pedido_externo: string | null;
  data: string;
  loja: string | null;
  descricao: string | null;
  valor_total: number;
  parcelas: number;
  fonte: 'importacao';
}

const COLUNAS: Record<string, string[]> = {
  data: ['data', 'data da compra', 'data compra', 'data do pedido', 'date'],
  origem: ['site', 'origem', 'marketplace', 'plataforma'],
  loja: ['loja', 'vendedor', 'estabelecimento', 'seller'],
  descricao: ['descricao', 'produto', 'produtos', 'item', 'itens'],
  valor: ['valor', 'valor total', 'total', 'preco', 'valor pago'],
  parcelas: ['parcelas', 'qtd parcelas', 'parcelamento', 'n parcelas'],
  pedido: ['pedido', 'n pedido', 'numero pedido', 'numero do pedido', 'id pedido', 'id do pedido'],
};

function chave(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function paraData(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function paraNumero(v: unknown): number | null {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/[R$\s]/g, '');
  if (!s) return null;
  const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
  return Number.isFinite(n) ? n : null;
}

export function identificarOrigem(texto: string, padrao: string): string {
  const achada = Object.entries(MARCAS).find(([, re]) => re.test(texto));
  return achada ? achada[0] : padrao;
}

export function lerPlanilhaCompras(
  dados: Uint8Array,
  origemPadrao: string
): { compras: CompraImportada[]; erros: string[] } {
  const wb = XLSX.read(dados, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  const compras: CompraImportada[] = [];
  const erros: string[] = [];
  linhas.forEach((linha, i) => {
    const campos: Record<string, unknown> = {};
    for (const [coluna, valor] of Object.entries(linha)) {
      const k = chave(coluna);
      const campo = Object.entries(COLUNAS).find(([, nomes]) => nomes.includes(k))?.[0];
      if (campo && campos[campo] === undefined) campos[campo] = valor;
    }

    const data = paraData(campos.data);
    const valor = paraNumero(campos.valor);
    if (!data || !valor || valor <= 0) {
      if (Object.values(linha).some((v) => String(v).trim())) {
        erros.push(`Linha ${i + 2}: data ou valor inválido.`);
      }
      return;
    }
    const loja = String(campos.loja ?? '').trim() || null;
    const parcelas = Math.min(48, Math.max(1, Math.round(paraNumero(campos.parcelas) ?? 1)));
    compras.push({
      origem: identificarOrigem(`${campos.origem ?? ''} ${loja ?? ''}`, origemPadrao),
      pedido_externo: String(campos.pedido ?? '').trim() || null,
      data,
      loja,
      descricao: String(campos.descricao ?? '').trim() || null,
      valor_total: Math.round(valor * 100) / 100,
      parcelas,
      fonte: 'importacao',
    });
  });
  return { compras, erros };
}
