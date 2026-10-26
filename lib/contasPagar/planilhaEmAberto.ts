import type ExcelJS from 'exceljs';
import { categoria, type TituloCP } from './dados';

/**
 * Excel no formato da planilha "materia prima e embalagem-em aberto" do
 * financeiro: cada aba tem duas semanas (segunda a sexta), com Embalagem,
 * Matéria-prima e Frete lado a lado (DATA / VALOR) e o Total geral.
 * Sábado e domingo entram na linha da segunda seguinte ("21, 22 e 23/10/2023").
 * Os valores são o saldo em aberto dos títulos de cada dia de vencimento.
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

/** "21, 22 e 23/10/2023" (mesmo mês) ou "30/09, 01 e 02/10/2023" */
function rotuloDias(dias: string[]): string {
  const mesmoMes = dias.every((d) => d.slice(0, 7) === dias[0].slice(0, 7));
  const partes = dias.map((d, i) => (mesmoMes && i < dias.length - 1 ? d.slice(8, 10) : `${d.slice(8, 10)}/${d.slice(5, 7)}`));
  const ultimo = dias[dias.length - 1];
  partes[partes.length - 1] = `${ultimo.slice(8, 10)}/${ultimo.slice(5, 7)}/${ultimo.slice(0, 4)}`;
  return partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
}

type ValoresDoDia = Map<string, number>; // dia de vencimento → saldo em aberto

/** saldo em aberto por categoria e dia de vencimento */
function agrupar(titulos: TituloCP[]) {
  const porCat = new Map<string, ValoresDoDia>(COLUNAS.map((c) => [c.cat, new Map()]));
  for (const t of titulos) {
    if (t.saldo <= 0.01) continue;
    const m = porCat.get(categoria(t));
    if (!m) continue; // "outras contas" não entram nesta planilha
    m.set(t.vencimento, (m.get(t.vencimento) ?? 0) + t.saldo);
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

/** bloco de uma semana a partir da linha r0 (cabeçalho em r0, DATA/VALOR em r0+1, dias em r0+2..r0+10, TOTAL em r0+12) */
function escreverSemana(ws: ExcelJS.Worksheet, r0: number, segunda: string, porCat: Map<string, ValoresDoDia>) {
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
  estilo(tg, { fonte: NEGRITO, fill: AMARELO, borda: { top: fina, left: fina, right: fina, bottom: fina }, al: { horizontal: 'center', vertical: 'middle' } });

  const linhasDias: number[] = [];
  for (let i = 0; i < 5; i++) {
    const r = r0 + 2 + i * 2;
    linhasDias.push(r);
    const util = somarDias(segunda, i);
    // dias que caem nesta linha: o próprio dia útil e, na segunda, o sábado e o domingo anteriores
    const dias = i === 0 ? [somarDias(util, -2), somarDias(util, -1), util] : [util];
    for (const col of COLUNAS) {
      const valores = porCat.get(col.cat)!;
      const comValor = dias.filter((d) => (valores.get(d) ?? 0) > 0.004);
      const total = comValor.reduce((s, d) => s + (valores.get(d) ?? 0), 0);
      const cData = ws.getCell(r, col.data);
      cData.value = comValor.length === 0 || (comValor.length === 1 && comValor[0] === util) ? dataExcel(util) : rotuloDias(comValor);
      estilo(cData, { fonte: NEGRITO, borda: { top: fina, left: fina, right: fina }, numFmt: 'mm-dd-yy', al: { horizontal: 'center', vertical: 'middle' } });
      const cValor = ws.getCell(r, col.valor);
      cValor.value = Math.round(total * 100) / 100;
      estilo(cValor, { borda: BORDA, numFmt: MOEDA });
    }
    const soma = COLUNAS.reduce((s, col) => s + Number(ws.getCell(r, col.valor).value), 0);
    const cTotal = ws.getCell(r, COL_TOTAL);
    cTotal.value = { formula: COLUNAS.map((c) => ws.getCell(r, c.valor).address).join('+'), result: Math.round(soma * 100) / 100 };
    estilo(cTotal, { fonte: NEGRITO, borda: BORDA, numFmt: MOEDA });
  }
  // faixa cinza depois da linha da segunda (que junta o fim de semana)
  for (const col of COLUNAS) {
    ws.mergeCells(r0 + 3, col.data, r0 + 3, col.valor);
    estilo(ws.getCell(r0 + 3, col.data), { fonte: NEGRITO, fill: CINZA, borda: { top: fina, left: fina, bottom: fina }, al: { horizontal: 'center' } });
    estilo(ws.getCell(r0 + 3, col.valor), { fonte: NEGRITO, fill: CINZA, borda: { top: fina, bottom: fina } });
  }

  const rTotal = r0 + 12;
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
  const somaGeral = COLUNAS.reduce((s, col) => s + Number((ws.getCell(rTotal, col.valor).value as { result: number }).result), 0);
  const tgv = ws.getCell(rTotal, COL_TOTAL);
  tgv.value = { formula: COLUNAS.map((c) => ws.getCell(rTotal, c.valor).address).join('+'), result: Math.round(somaGeral * 100) / 100 };
  estilo(tgv, { fonte: NEGRITO, borda: BORDA, numFmt: MOEDA });
  return rTotal;
}

const br = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}`;

export async function planilhaEmAberto(titulos: TituloCP[], de: string, ate: string): Promise<ExcelJS.Workbook> {
  const ExcelJSMod = (await import('exceljs')).default;
  const wb = new ExcelJSMod.Workbook();
  wb.creator = 'Natuhair Finanças';
  // as fórmulas de total são recalculadas pelo Excel ao abrir (o resultado zero não fica gravado)
  wb.calcProperties = { fullCalcOnLoad: true };
  const porCat = agrupar(titulos);

  // semanas (segunda) do período; fim de semana conta na segunda seguinte
  const semanas: string[] = [];
  for (let s = segundaDa(diaUtil(de)); s <= segundaDa(diaUtil(ate)); s = somarDias(s, 7)) semanas.push(s);

  for (let i = 0; i < semanas.length; i += 2) {
    const par = semanas.slice(i, i + 2);
    const nome = `${br(par[0])} a ${br(somarDias(par[par.length - 1], 4))}`;
    const ws = wb.addWorksheet(nome);
    [17.85546875, 18, undefined, 20.7109375, 18, undefined, 26.5703125, 16.42578125, undefined, 18].forEach((w, c) => {
      if (w) ws.getColumn(c + 1).width = w;
    });

    ws.mergeCells(1, 1, 1, COL_TOTAL);
    const titulo = ws.getCell(1, 1);
    titulo.value = 'VALORES EM ABERTO';
    estilo(titulo, { fonte: NEGRITO, fill: LARANJA, borda: BORDA, al: { horizontal: 'center' } });

    const totais: number[] = [escreverSemana(ws, 2, par[0], porCat)];
    if (par[1]) totais.push(escreverSemana(ws, 17, par[1], porCat));

    // total das duas semanas, por coluna (linha 32, como na planilha)
    if (totais.length === 2) {
      for (const col of COLUNAS) {
        const letra = ws.getColumn(col.valor).letter;
        const soma = totais.reduce((s, r) => s + Number((ws.getCell(r, col.valor).value as { result: number }).result), 0);
        const c = ws.getCell(32, col.data);
        c.value = { formula: totais.map((r) => `${letra}${r}`).join('+'), result: Math.round(soma * 100) / 100 };
        estilo(c, { numFmt: MOEDA });
      }
    }
    for (let r = 1; r <= ws.rowCount; r++) ws.getRow(r).height = 18.75;
  }
  return wb;
}
