import type ExcelJS from 'exceljs';
import { categoria, type TituloCP } from './dados';

/**
 * Excel no formato da planilha "materia prima e embalagem-em aberto" do
 * financeiro, numa aba só com o período inteiro (mesmo atravessando meses):
 * as semanas (segunda a sexta) uma embaixo da outra, com Embalagem,
 * Matéria-prima e Frete lado a lado (DATA / VALOR) e o Total geral.
 * Sábado e domingo entram na linha da segunda seguinte ("21, 22 e 23/10/2023").
 * Os valores são o valor original dos títulos em aberto de cada dia de
 * vencimento, os mesmos dos cards de categoria da tela.
 */

const COLUNAS = [
  { cat: 'embalagem', titulo: 'EMBALAGEM', data: 1, valor: 2 }, // A, B
  { cat: 'materia_prima', titulo: 'MATERIA PRIMA', data: 4, valor: 5 }, // D, E
  { cat: 'frete', titulo: 'FRETE', data: 7, valor: 8 }, // G, H
] as const;
const COL_TOTAL = 10; // J
const DIA = 86_400_000;

const MOEDA = '"R$" #,##0.00';
const FONTE = { name: 'Calibri', size: 14, color: { theme: 1 } } as Partial<ExcelJS.Font>;
const NEGRITO = { ...FONTE, bold: true } as Partial<ExcelJS.Font>;
const fina: Partial<ExcelJS.Border> = { style: 'thin' };
const BORDA: Partial<ExcelJS.Borders> = { top: fina, left: fina, bottom: fina, right: fina };
const LARANJA: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC000' } };
const AMARELO: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
// mesmo cinza da planilha: cor do tema 1 clareada 35% (o tipo do ExcelJS não declara "tint", mas ele grava)
const CINZA: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { theme: 1, tint: 0.3499862666707358 } as unknown as Partial<ExcelJS.Color>,
};

const somarDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DIA).toISOString().slice(0, 10);
const diaSemana = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
/** sábado e domingo vão para a segunda seguinte */
const diaUtil = (iso: string) => (diaSemana(iso) === 6 ? somarDias(iso, 2) : diaSemana(iso) === 0 ? somarDias(iso, 1) : iso);
const segundaDa = (iso: string) => somarDias(iso, -((diaSemana(iso) + 6) % 7));
const dataExcel = (iso: string) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** "21, 22 e 23/10/2023" (mesmo mês) ou "30/09, 01 e 02/10/2023" */
function rotuloDias(dias: string[]): string {
  const mesmoMes = dias.every((d) => d.slice(0, 7) === dias[0].slice(0, 7));
  const partes = dias.map((d, i) => (mesmoMes && i < dias.length - 1 ? d.slice(8, 10) : `${d.slice(8, 10)}/${d.slice(5, 7)}`));
  const ultimo = dias[dias.length - 1];
  partes[partes.length - 1] = `${ultimo.slice(8, 10)}/${ultimo.slice(5, 7)}/${ultimo.slice(0, 4)}`;
  return partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
}

type ValoresDoDia = Map<string, number>; // dia de vencimento → valor original

/** valor original dos títulos em aberto por categoria e dia de vencimento */
function agrupar(titulos: TituloCP[]) {
  const porCat = new Map<string, ValoresDoDia>(COLUNAS.map((c) => [c.cat, new Map()]));
  for (const t of titulos) {
    if (t.saldo <= 0.01) continue;
    const m = porCat.get(categoria(t));
    if (!m) continue; // "outras contas" não entram nesta planilha
    m.set(t.vencimento, (m.get(t.vencimento) ?? 0) + t.valor);
  }
  return porCat;
}

function estilo(c: ExcelJS.Cell, opts: { fonte?: Partial<ExcelJS.Font>; borda?: Partial<ExcelJS.Borders>; fill?: ExcelJS.Fill; numFmt?: string; al?: Partial<ExcelJS.Alignment> }) {
  c.font = opts.fonte ?? FONTE;
  if (opts.borda) c.border = opts.borda;
  if (opts.fill) c.fill = opts.fill;
  if (opts.numFmt) c.numFmt = opts.numFmt;
  if (opts.al) c.alignment = opts.al;
}

// o ExcelJS não guarda o resultado zero da fórmula: sem resultado vale 0
const resultado = (c: ExcelJS.Cell) => Number((c.value as { result?: number } | null)?.result ?? 0);

/**
 * Bloco de uma semana a partir da linha r0: cabeçalho em r0, DATA/VALOR em r0+1 e
 * uma linha por dia útil do período (com uma linha de respiro entre os dias;
 * depois da segunda, que junta o fim de semana, a faixa cinza). Devolve a linha do TOTAL.
 */
function escreverSemana(ws: ExcelJS.Worksheet, r0: number, diasUteis: string[], porCat: Map<string, ValoresDoDia>) {
  for (const col of COLUNAS) {
    ws.mergeCells(r0, col.data, r0, col.valor);
    const cab = ws.getCell(r0, col.data);
    cab.value = col.titulo;
    estilo(cab, { fonte: NEGRITO, fill: AMARELO, borda: { bottom: fina }, al: { horizontal: 'center' } });
    estilo(ws.getCell(r0, col.valor), { fonte: NEGRITO, fill: AMARELO, borda: { bottom: fina } });
    ws.getCell(r0 + 1, col.data).value = 'DATA';
    ws.getCell(r0 + 1, col.valor).value = 'VALOR';
    for (const c of [col.data, col.valor]) estilo(ws.getCell(r0 + 1, c), { fonte: NEGRITO, borda: BORDA, al: { horizontal: 'center' } });
  }
  ws.mergeCells(r0, COL_TOTAL, r0 + 1, COL_TOTAL);
  const tg = ws.getCell(r0, COL_TOTAL);
  tg.value = 'TOTAL GERAL';
  estilo(tg, { fonte: NEGRITO, fill: AMARELO, borda: BORDA, al: { horizontal: 'center', vertical: 'middle' } });

  const linhasDias: number[] = [];
  diasUteis.forEach((util, i) => {
    const r = r0 + 2 + i * 2;
    linhasDias.push(r);
    // dias que caem nesta linha: o próprio dia útil e, na segunda, o sábado e o domingo anteriores
    const dias = diaSemana(util) === 1 ? [somarDias(util, -2), somarDias(util, -1), util] : [util];
    for (const col of COLUNAS) {
      const valores = porCat.get(col.cat)!;
      const comValor = dias.filter((d) => (valores.get(d) ?? 0) > 0.004);
      const total = comValor.reduce((s, d) => s + (valores.get(d) ?? 0), 0);
      const cData = ws.getCell(r, col.data);
      cData.value = comValor.length === 0 || (comValor.length === 1 && comValor[0] === util) ? dataExcel(util) : rotuloDias(comValor);
      estilo(cData, { fonte: NEGRITO, borda: { top: fina, left: fina, right: fina }, numFmt: 'dd/mm/yyyy', al: { horizontal: 'center', vertical: 'middle' } });
      const cValor = ws.getCell(r, col.valor);
      cValor.value = Math.round(total * 100) / 100;
      estilo(cValor, { borda: BORDA, numFmt: MOEDA });
    }
    const soma = COLUNAS.reduce((s, col) => s + Number(ws.getCell(r, col.valor).value), 0);
    const cTotal = ws.getCell(r, COL_TOTAL);
    cTotal.value = { formula: COLUNAS.map((c) => ws.getCell(r, c.valor).address).join('+'), result: Math.round(soma * 100) / 100 };
    estilo(cTotal, { fonte: NEGRITO, borda: BORDA, numFmt: MOEDA });
    // faixa cinza depois da linha da segunda (que junta o fim de semana)
    if (diaSemana(util) === 1 && i < diasUteis.length - 1) {
      for (const col of COLUNAS) {
        ws.mergeCells(r + 1, col.data, r + 1, col.valor);
        estilo(ws.getCell(r + 1, col.data), { fonte: NEGRITO, fill: CINZA, borda: { top: fina, left: fina, bottom: fina } });
        estilo(ws.getCell(r + 1, col.valor), { fonte: NEGRITO, fill: CINZA, borda: { top: fina, bottom: fina } });
      }
    }
  });

  const rTotal = r0 + 2 + diasUteis.length * 2;
  for (const col of COLUNAS) {
    const t = ws.getCell(rTotal, col.data);
    t.value = 'TOTAL';
    estilo(t, { fonte: NEGRITO, borda: BORDA, al: { horizontal: 'center', vertical: 'middle' } });
    const letra = ws.getColumn(col.valor).letter;
    const soma = linhasDias.reduce((s, r) => s + Number(ws.getCell(r, col.valor).value), 0);
    const v = ws.getCell(rTotal, col.valor);
    v.value = { formula: linhasDias.map((r) => `${letra}${r}`).join('+'), result: Math.round(soma * 100) / 100 };
    estilo(v, { fonte: NEGRITO, borda: BORDA, numFmt: MOEDA });
  }
  const somaGeral = COLUNAS.reduce((s, col) => s + resultado(ws.getCell(rTotal, col.valor)), 0);
  const tgv = ws.getCell(rTotal, COL_TOTAL);
  tgv.value = { formula: COLUNAS.map((c) => ws.getCell(rTotal, c.valor).address).join('+'), result: Math.round(somaGeral * 100) / 100 };
  estilo(tgv, { fonte: NEGRITO, borda: BORDA, numFmt: MOEDA });
  return rTotal;
}

export async function planilhaEmAberto(titulos: TituloCP[], de: string, ate: string): Promise<ExcelJS.Workbook> {
  const ExcelJSMod = (await import('exceljs')).default;
  const wb = new ExcelJSMod.Workbook();
  wb.creator = 'Natuhair';
  // as fórmulas de total são recalculadas pelo Excel ao abrir (o resultado zero não fica gravado)
  wb.calcProperties = { fullCalcOnLoad: true };
  const porCat = agrupar(titulos);

  // dias úteis do período (fim de semana conta na segunda seguinte), agrupados por semana
  const semanas = new Map<string, string[]>();
  for (let d = diaUtil(de); d <= diaUtil(ate); d = somarDias(d, 1)) {
    if (diaSemana(d) === 0 || diaSemana(d) === 6) continue;
    const s = segundaDa(d);
    semanas.set(s, [...(semanas.get(s) ?? []), d]);
  }

  const ws = wb.addWorksheet('Valores em aberto');
  [17.85546875, 18, undefined, 20.7109375, 18, undefined, 26.5703125, 16.42578125, undefined, 18].forEach((w, c) => {
    if (w) ws.getColumn(c + 1).width = w;
  });

  ws.mergeCells(1, 1, 1, COL_TOTAL);
  const titulo = ws.getCell(1, 1);
  titulo.value = `VALORES EM ABERTO — ${br(de)} a ${br(ate)}`;
  estilo(titulo, { fonte: NEGRITO, fill: LARANJA, borda: BORDA, al: { horizontal: 'center' } });

  const totais: number[] = [];
  let r = 2;
  for (const dias of Array.from(semanas.values())) {
    const rTotal = escreverSemana(ws, r, dias, porCat);
    totais.push(rTotal);
    r = rTotal + 3;
  }

  // total do período inteiro, por coluna e geral
  if (totais.length) {
    for (const col of COLUNAS) {
      const rot = ws.getCell(r, col.data);
      rot.value = 'TOTAL PERÍODO';
      estilo(rot, { fonte: NEGRITO, fill: LARANJA, borda: BORDA, al: { horizontal: 'center', vertical: 'middle' } });
      const letra = ws.getColumn(col.valor).letter;
      const soma = totais.reduce((s, t) => s + resultado(ws.getCell(t, col.valor)), 0);
      const c = ws.getCell(r, col.valor);
      c.value = { formula: totais.map((t) => `${letra}${t}`).join('+'), result: Math.round(soma * 100) / 100 };
      estilo(c, { fonte: NEGRITO, fill: LARANJA, borda: BORDA, numFmt: MOEDA });
    }
    const somaGeral = COLUNAS.reduce((s, col) => s + resultado(ws.getCell(r, col.valor)), 0);
    const g = ws.getCell(r, COL_TOTAL);
    g.value = { formula: COLUNAS.map((c) => ws.getCell(r, c.valor).address).join('+'), result: Math.round(somaGeral * 100) / 100 };
    estilo(g, { fonte: NEGRITO, fill: LARANJA, borda: BORDA, numFmt: MOEDA });
  }
  for (let i = 1; i <= ws.rowCount; i++) ws.getRow(i).height = 18.75;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  return wb;
}
