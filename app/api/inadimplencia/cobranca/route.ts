import ExcelJS from 'exceljs';
import { requireInadimplencia } from '@/lib/auth';
import { buscarVencidos } from '@/lib/inadimplencia/dados';
import { filtrar, type Filtros, type TituloVencido } from '@/lib/inadimplencia/comum';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Planilha no modelo da cobrança ("INAD <VENDEDOR>.xlsx"): título INADIMPLÊNCIA <NOME>, colunas
 * REPRESENTANTE | NF | CLIENTE | EMISSÃO | VENC | VALOR | CIDADE | EMPRESA | DESCRIÇÃO BANCARIA,
 * uma linha em branco entre os títulos e o total no fim. Com um vendedor só, uma aba; com vários
 * (região ou tudo), uma aba por vendedor e a aba FINAL (como o "INAD TOTAL CENTRO OESTE").
 * Aceita os mesmos filtros da tela.
 */

const FONTE = 'Calibri';
const CINZA: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD0CECE' } };
const fino: Partial<ExcelJS.Border> = { style: 'thin' };
const BORDA: Partial<ExcelJS.Borders> = { top: fino, left: fino, bottom: fino, right: fino };
const NUM = '#,##0.00';
const MOEDA = '"R$"#,##0.00';
const data = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`) : null);
const r2 = (n: number) => Math.round(n * 100) / 100;
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** "MARIA DO ROCIO ( MS )" → "MARIA DO ROCIO" (como a cobrança escreve na coluna REPRESENTANTE). */
const nomeCurto = (v: string) => v.replace(/\(.*$/, '').replace(/\s+/g, ' ').trim().toUpperCase() || v.toUpperCase();
const nomeAba = (s: string, usadas: Set<string>) => {
  let n = semAcento(s).replace(/[\\/*?:[\]]/g, ' ').slice(0, 28).trim() || 'VENDEDOR';
  let i = 2;
  while (usadas.has(n)) n = `${n.slice(0, 25)} ${i++}`;
  usadas.add(n);
  return n;
};

function abaVendedor(wb: ExcelJS.Workbook, nome: string, titulos: TituloVencido[], usadas: Set<string>) {
  const ws = wb.addWorksheet(nomeAba(nome, usadas));
  ws.columns = [{ width: 21.86 }, { width: 13.57 }, { width: 29.71 }, { width: 11 }, { width: 12.14 }, { width: 15 }, { width: 23.43 }, { width: 10.71 }, { width: 28.29 }];
  ws.mergeCells('A1:I2');
  const t = ws.getCell('A1');
  t.value = `INADIMPLÊNCIA ${nome}`;
  t.font = { name: FONTE, size: 16, bold: true };
  t.fill = CINZA;
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  t.border = { top: { style: 'medium' }, left: { style: 'medium' }, right: { style: 'medium' }, bottom: { style: 'medium' } };

  const cab = ['REPRESENTANTE', 'NF', 'CLIENTE', 'EMISSÃO', 'VENC', 'VALOR', 'CIDADE', 'EMPRESA', 'DESCRIÇÃO BANCARIA'];
  ws.getRow(3).height = 24;
  cab.forEach((c, i) => {
    const cell = ws.getCell(3, i + 1);
    cell.value = c;
    cell.font = { name: FONTE, size: 11, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = BORDA;
  });

  const estilo = (cell: ExcelJS.Cell) => {
    cell.font = { name: FONTE, size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = BORDA;
  };
  // linha em branco (com borda) entre os títulos, como na planilha
  const branco = (r: number) => {
    for (let c = 1; c <= 9; c++) estilo(ws.getCell(r, c));
    ws.getRow(r).height = 12;
  };
  let r = 4;
  branco(r++);
  const ordenados = [...titulos].sort((a, b) => a.clienteFantasia.localeCompare(b.clienteFantasia) || a.vencimento.localeCompare(b.vencimento));
  for (const x of ordenados) {
    const valores = [
      nomeCurto(x.vendedor),
      x.documento,
      x.clienteFantasia,
      data(x.emissao),
      data(x.vencimento),
      r2(x.saldo),
      x.cidade.toUpperCase(),
      // "VENEZA (RJ)" → "VENEZA RJ"; "BIOSENSE MATRIZ E1" → "BIOSENSE"
      x.empresa.replace(/[()]/g, '').replace(/MATRIZ.*$/i, '').replace(/\s+/g, ' ').trim().toUpperCase(),
      x.descricao,
    ];
    valores.forEach((v, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = v as ExcelJS.CellValue;
      estilo(cell);
      if (i === 3 || i === 4) cell.numFmt = 'dd/mm/yyyy';
      if (i === 5) cell.numFmt = NUM;
    });
    r++;
    branco(r++);
  }
  const tot = ws.getCell(r + 1, 6);
  tot.value = { formula: `SUM(F5:F${r - 1})`, result: r2(titulos.reduce((s, x) => s + x.saldo, 0)) };
  tot.font = { name: FONTE, size: 14, bold: true };
  tot.fill = CINZA;
  tot.numFmt = NUM;
  tot.alignment = { horizontal: 'center' };
  tot.border = BORDA;
  ws.views = [{ state: 'frozen', ySplit: 3 }];
}

/** Aba FINAL: total por representante e totais de CARTEIRA / RECOMPRA / FIDC. */
function abaFinal(wb: ExcelJS.Workbook, titulo: string, grupos: { nome: string; ts: TituloVencido[] }[]) {
  const ws = wb.addWorksheet('FINAL', { views: [{}] });
  ws.columns = [{ width: 30 }, { width: 18 }, { width: 20 }, { width: 18 }];
  ws.mergeCells('A1:B1');
  const t = ws.getCell('A1');
  t.value = titulo;
  t.font = { name: FONTE, size: 14, bold: true };
  t.fill = CINZA;
  t.border = BORDA;
  ['REPRESENTANTE', 'VALOR'].forEach((c, i) => {
    const cell = ws.getCell(2, i + 1);
    cell.value = c;
    cell.font = { name: FONTE, size: 11, bold: true };
    cell.alignment = { horizontal: 'center' };
    cell.border = BORDA;
  });
  let r = 4;
  for (const g of grupos) {
    ws.getCell(r, 1).value = g.nome;
    ws.getCell(r, 2).value = r2(g.ts.reduce((s, x) => s + x.saldo, 0));
    ws.getCell(r, 2).numFmt = MOEDA;
    [1, 2].forEach((c) => {
      ws.getCell(r, c).border = BORDA;
      ws.getCell(r, c).font = { name: FONTE, size: 11 };
    });
    r += 2;
  }
  const todos = grupos.flatMap((g) => g.ts);
  const tot = ws.getCell(r, 2);
  tot.value = r2(todos.reduce((s, x) => s + x.saldo, 0));
  tot.numFmt = MOEDA;
  tot.font = { name: FONTE, size: 12, bold: true };
  tot.fill = CINZA;
  tot.border = BORDA;

  const porDesc = (f: (x: TituloVencido) => boolean) => r2(todos.filter(f).reduce((s, x) => s + x.saldo, 0));
  (
    [
      ['TOTAL CARTEIRA:', porDesc((x) => x.descricao === 'CARTEIRA')],
      ['TOTAL RECOMPRA:', porDesc((x) => x.descricao === 'RECOMPRA')],
      ['TOTAL FIDC:', porDesc((x) => x.descricao !== 'CARTEIRA' && x.descricao !== 'RECOMPRA')],
    ] as const
  ).forEach(([rot, v], i) => {
    ws.getCell(3 + i * 2, 3).value = rot;
    ws.getCell(3 + i * 2, 3).font = { name: FONTE, size: 11, bold: true };
    ws.getCell(3 + i * 2, 4).value = v;
    ws.getCell(3 + i * 2, 4).numFmt = MOEDA;
  });
}

export async function GET(request: Request) {
  await requireInadimplencia();
  const p = new URL(request.url).searchParams;
  const f: Filtros = {
    empresa: p.get('empresa') ?? '',
    tipo: (p.get('tipo') ?? '') as Filtros['tipo'],
    fidc: p.get('fidc') ?? '',
    faixa: (p.get('faixa') ?? '') as Filtros['faixa'],
    vendedor: p.get('vendedor') ?? '',
    regiao: p.get('regiao') ?? '',
    busca: p.get('busca') ?? '',
  };
  let ts: TituloVencido[];
  try {
    ts = filtrar(await buscarVencidos(p.get('grupo') === '1'), f);
  } catch (e) {
    return new Response(`Não consegui ler o ORGM: ${e instanceof Error ? e.message : String(e)}`, { status: 500 });
  }
  if (!ts.length) return new Response('Nenhum título vencido com esse filtro.', { status: 404 });

  // um grupo por vendedor (código), o de maior valor primeiro
  const m = new Map<string, TituloVencido[]>();
  ts.forEach((x) => m.set(x.vendedorCod || x.vendedor, [...(m.get(x.vendedorCod || x.vendedor) ?? []), x]));
  const grupos = Array.from(m.values())
    .map((l) => ({ nome: nomeCurto(l[0].vendedor), ts: l }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  const wb = new ExcelJS.Workbook();
  const usadas = new Set<string>();
  let nomeArquivo: string;
  if (grupos.length === 1) {
    abaVendedor(wb, grupos[0].nome, grupos[0].ts, usadas);
    nomeArquivo = `INAD ${grupos[0].nome}`;
  } else {
    const alvo = (f.regiao || 'GERAL').toUpperCase();
    abaFinal(wb, `TOTAL DE INADIMPLÊNCIA ${alvo}`, grupos);
    grupos.forEach((g) => abaVendedor(wb, g.nome, g.ts, usadas));
    nomeArquivo = `INAD TOTAL ${alvo}`;
  }

  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }).replace(/\//g, '.');
  const nome = `${nomeArquivo} ${hoje}.xlsx`;
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${semAcento(nome)}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
    },
  });
}
