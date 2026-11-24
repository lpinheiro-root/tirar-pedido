import { promises as fs } from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { requireFidcMensal } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { NOMES_MES, ordemEmpresa, ordemFidc } from '@/lib/fidc/riscoOrdem';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// mesmo visual da planilha RISCO GERAL OPERAÇÕES FIDCs do financeiro
const FONTE = 'Aptos Narrow';
const MOEDA = '_-"R$" * #,##0.00_-;-"R$" * #,##0.00_-;_-"R$" * "-"??_-;_-@_-';
const AZUL_ESCURO = 'FF071D7B';
const AZUL_CLARO = 'FFAFBDFB';
const AZUL_BASE = 'FF63A4F7';
const PRETO = 'FF000000';
const solido = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const fino: Partial<ExcelJS.Border> = { style: 'thin' };
const BORDA: Partial<ExcelJS.Borders> = { top: fino, left: fino, bottom: fino, right: fino };
const r2 = (n: number) => Math.round(n * 100) / 100;

interface Linha {
  ordem: number;
  empresa: string;
  fidc: string;
  a_vencer: number;
  vencidos: number;
}

function celula(c: ExcelJS.Cell, valor: ExcelJS.CellValue, opt: { fill?: string; branco?: boolean; bold?: boolean; size?: number; moeda?: boolean; indent?: number; h?: ExcelJS.Alignment['horizontal'] } = {}) {
  c.value = valor;
  c.font = { name: FONTE, size: opt.size ?? 11, bold: opt.bold, color: { argb: opt.branco ? 'FFFFFFFF' : PRETO } };
  if (opt.fill) c.fill = solido(opt.fill);
  if (opt.moeda) c.numFmt = MOEDA;
  c.border = BORDA;
  if (opt.h || opt.indent) c.alignment = { horizontal: opt.h ?? 'left', indent: opt.indent };
}

/** Título no lugar do retângulo azul da planilha, com o logo à esquerda. */
function titulo(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, texto: string, altura: number, logo: number | null) {
  ws.mergeCells('A1:D1');
  const c = ws.getCell('A1');
  c.value = texto;
  c.font = { name: FONTE, size: 20, bold: true, color: { argb: 'FFFFFFFF' } };
  c.fill = solido(AZUL_ESCURO);
  c.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = altura;
  if (logo != null) ws.addImage(logo, { tl: { col: 0.15, row: 0.12 }, ext: { width: 70, height: 50 } });
  void wb;
}

function totais(linhas: Linha[]) {
  const v = r2(linhas.reduce((s, l) => s + l.a_vencer, 0));
  const d = r2(linhas.reduce((s, l) => s + l.vencidos, 0));
  return [v, d, r2(v + d)] as const;
}

/** DIN.1: empresa (linha azul clara) com as FIDCs embaixo, e o Total Geral. */
function din1(wb: ExcelJS.Workbook, linhas: Linha[], logo: number | null) {
  const ws = wb.addWorksheet('DIN.1');
  ws.columns = [{ width: 16 }, { width: 16 }, { width: 14 }, { width: 16 }];
  titulo(wb, ws, 'RISCO FIDC GERAL', 61.5, logo);
  ws.getRow(2).height = 0.75;
  ['', ' A VENCER', ' VENCIDOS', ' TOTAL'].forEach((t, i) => celula(ws.getCell(3, i + 1), t, { fill: AZUL_ESCURO, branco: true, bold: true, h: i ? 'center' : 'left' }));
  let r = 4;
  const empresas = Array.from(new Set(linhas.map((l) => l.empresa))).sort(ordemEmpresa);
  for (const e of empresas) {
    const doGrupo = linhas.filter((l) => l.empresa === e);
    const [v, d, t] = totais(doGrupo);
    celula(ws.getCell(r, 1), e, { fill: AZUL_CLARO, bold: true });
    [v, d, t].forEach((x, i) => celula(ws.getCell(r, i + 2), x, { fill: AZUL_CLARO, bold: true, moeda: true }));
    r++;
    // mesma FIDC pode aparecer 2x na BASE: soma
    const porFidc = new Map<string, Linha[]>();
    for (const l of doGrupo) porFidc.set(l.fidc, [...(porFidc.get(l.fidc) ?? []), l]);
    for (const f of Array.from(porFidc.keys()).sort(ordemFidc)) {
      const [fv, fd, ft] = totais(porFidc.get(f)!);
      celula(ws.getCell(r, 1), f, { indent: 1 });
      [fv, fd, ft].forEach((x, i) => celula(ws.getCell(r, i + 2), x, { moeda: true }));
      r++;
    }
  }
  const [v, d, t] = totais(linhas);
  celula(ws.getCell(r, 1), 'Total Geral', { fill: AZUL_ESCURO, branco: true, bold: true });
  [v, d, t].forEach((x, i) => celula(ws.getCell(r, i + 2), x, { fill: AZUL_ESCURO, branco: true, bold: true, moeda: true }));
}

/** DIN.2: uma linha por FIDC e o Total Geral. */
function din2(wb: ExcelJS.Workbook, linhas: Linha[], logo: number | null) {
  const ws = wb.addWorksheet('DIN.2');
  ws.columns = [{ width: 13 }, { width: 16 }, { width: 14 }, { width: 16 }];
  titulo(wb, ws, 'RISCO FIDC', 47.25, logo);
  [' FIDIC', ' A VENCER', ' VENCIDOS', '  TOTAL'].forEach((t, i) => celula(ws.getCell(2, i + 1), t, { fill: AZUL_ESCURO, branco: true, bold: true, h: 'center' }));
  let r = 3;
  for (const f of Array.from(new Set(linhas.map((l) => l.fidc))).sort(ordemFidc)) {
    const [v, d, t] = totais(linhas.filter((l) => l.fidc === f));
    celula(ws.getCell(r, 1), f);
    [v, d, t].forEach((x, i) => celula(ws.getCell(r, i + 2), x, { moeda: true }));
    r++;
  }
  const [v, d, t] = totais(linhas);
  celula(ws.getCell(r, 1), 'Total Geral', { fill: AZUL_ESCURO, branco: true, bold: true });
  [v, d, t].forEach((x, i) => celula(ws.getCell(r, i + 2), x, { fill: AZUL_ESCURO, branco: true, bold: true, moeda: true }));
}

/** BASE: data da posição no topo e a tabela EMPRESA | FIDIC | A VENCER | VENCIDOS | TOTAL, na ordem em que veio. */
function base(wb: ExcelJS.Workbook, linhas: Linha[], dataPosicao: string | null) {
  const ws = wb.addWorksheet('BASE');
  ws.columns = [{ width: 14.14 }, { width: 10.57 }, { width: 16.43 }, { width: 15.29 }, { width: 16 }];
  ws.mergeCells('A1:E1');
  const c1 = ws.getCell('A1');
  c1.value = dataPosicao ? new Date(`${dataPosicao}T12:00:00`) : null;
  c1.numFmt = 'dd/mm/yy';
  c1.font = { name: FONTE, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  c1.fill = solido(PRETO);
  c1.alignment = { horizontal: 'left', vertical: 'middle' };
  const cab = { fill: PRETO, branco: true, bold: true, size: 10 };
  ['EMPRESA', 'FIDIC', 'A VENCER', 'VENCIDOS', 'TOTAL'].forEach((t, i) => celula(ws.getCell(3, i + 1), t, { ...cab, h: i === 0 || i === 4 ? 'left' : 'center' }));
  linhas.forEach((l, i) => {
    const r = 4 + i;
    // primeira linha de cada FIDC destacada em azul, como na planilha
    const fill = i === 0 || linhas[i - 1].fidc !== l.fidc ? AZUL_BASE : undefined;
    const o = { fill, bold: true, size: 10 };
    celula(ws.getCell(r, 1), l.empresa, o);
    celula(ws.getCell(r, 2), l.fidc, { ...o, h: 'center' });
    celula(ws.getCell(r, 3), l.a_vencer, { ...o, moeda: true, h: 'center' });
    celula(ws.getCell(r, 4), l.vencidos, { ...o, moeda: true, h: 'center' });
    celula(ws.getCell(r, 5), { formula: `SUM(C${r}:D${r})`, result: r2(l.a_vencer + l.vencidos) }, { ...o, moeda: true });
  });
  ws.mergeCells(`A${linhas.length + 6}:E${linhas.length + 6}`);
}

/** Exporta o mês (?mes=AAAA-MM) no mesmo modelo da planilha RISCO GERAL OPERAÇÕES FIDCs. */
export async function GET(request: Request) {
  await requireFidcMensal();
  const mes = new URL(request.url).searchParams.get('mes') ?? '';
  if (!/^\d{4}-\d{2}$/.test(mes)) return new Response('Escolha o mês.', { status: 400 });
  const db = createServiceRoleClient();
  const [{ data: cab }, { data: linhas, error }] = await Promise.all([
    db.from('fidc_risco_meses').select('data_posicao').eq('mes', `${mes}-01`).maybeSingle(),
    db.from('fidc_risco').select('ordem,empresa,fidc,a_vencer,vencidos').eq('mes', `${mes}-01`).order('ordem'),
  ]);
  if (error) return new Response(error.message, { status: 500 });
  if (!linhas?.length) return new Response('Esse mês ainda não foi importado.', { status: 404 });
  const ls: Linha[] = linhas.map((l) => ({ ...l, a_vencer: Number(l.a_vencer) || 0, vencidos: Number(l.vencidos) || 0 }));

  const wb = new ExcelJS.Workbook();
  let logo: number | null = null;
  try {
    const png = await fs.readFile(path.join(process.cwd(), 'lib/fidc/assets/logo-natuhair.png'));
    logo = wb.addImage({ buffer: png as unknown as ExcelJS.Buffer, extension: 'png' });
  } catch {
    logo = null;
  }
  din1(wb, ls, logo);
  din2(wb, ls, logo);
  base(wb, ls, cab?.data_posicao ?? null);

  const nome = `RISCO GERAL OPERAÇÕES FIDCs ${NOMES_MES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}.xlsx`;
  const ascii = nome.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
    },
  });
}
