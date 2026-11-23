import ExcelJS from 'exceljs';
import { requireFidc } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { buscarTodas } from '@/lib/supabasePaginado';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: unknown) => Number(v) || 0;
const br = (iso: string) => iso.split('-').reverse().join('/');
const dataExcel = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`);

// mesmo formato de moeda da planilha do financeiro
const MOEDA = '_-[$R$-416] * #,##0.00_-;-[$R$-416] * #,##0.00_-;_-[$R$-416] * "-"??_-;_-@_-';
const FONTE = 'Times New Roman';
const AMARELO: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
const CINZA: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7E6E6' } };
const fino: Partial<ExcelJS.Border> = { style: 'thin' };
const medio: Partial<ExcelJS.Border> = { style: 'medium' };
const BORDA: Partial<ExcelJS.Borders> = { top: fino, left: fino, bottom: fino, right: fino };

interface Op {
  data: string;
  ordem: number;
  nome_original: string;
  valor_operacao: number;
  bruto: number;
  recompras: number;
  refaturamento: number;
  nota_troca: number;
  substituicao: number;
  prorrogacao: number;
  desconto: number;
  despesas: number;
  liquido: number;
}
interface Fat {
  data_operacao: string;
  data_faturamento: string | null;
  valor: number;
}
type Campo = Exclude<keyof Op, 'data' | 'ordem' | 'nome_original'>;

// colunas que só aparecem na aba quando o dia teve esse lançamento (entre Recompras e Desconto, como na planilha)
const EXTRAS: { campo: Campo; titulo: string; tam: number }[] = [
  { campo: 'refaturamento', titulo: 'REFATURAMENTO', tam: 8 },
  { campo: 'nota_troca', titulo: 'Nota de troca', tam: 12 },
  { campo: 'substituicao', titulo: 'Substituição', tam: 14 },
  { campo: 'prorrogacao', titulo: 'Prorrogação', tam: 14 },
];

interface Coluna {
  campo: Campo | 'nome';
  titulo: string;
  tamTitulo: number;
  largura: number[]; // duas larguras = coluna mesclada em duas, como na planilha
  zeroVazio?: boolean; // recompras/desconto zerados ficam em branco
}

function colunasDoDia(ops: Op[]): Coluna[] {
  const cols: Coluna[] = [
    { campo: 'nome', titulo: 'FIDC/ EMPRESA', tamTitulo: 11, largura: [10, 15.73] },
    { campo: 'valor_operacao', titulo: 'Valor da operação', tamTitulo: 12, largura: [9.5, 13.54] },
    { campo: 'bruto', titulo: 'VALOR/ bruto', tamTitulo: 14, largura: [9.5, 16] },
    { campo: 'recompras', titulo: 'Recompras', tamTitulo: 14, largura: [9.5, 11], zeroVazio: true },
  ];
  for (const e of EXTRAS)
    if (ops.some((o) => o[e.campo])) cols.push({ campo: e.campo, titulo: e.titulo, tamTitulo: e.tam, largura: [19], zeroVazio: true });
  cols.push(
    { campo: 'desconto', titulo: 'Desconto', tamTitulo: 16, largura: [21.82], zeroVazio: true },
    { campo: 'despesas', titulo: 'Despesas', tamTitulo: 14, largura: [21] },
    { campo: 'liquido', titulo: 'VALOR/liquido', tamTitulo: 12, largura: [9.5, 11] }
  );
  return cols;
}

const fonte = (size: number): Partial<ExcelJS.Font> => ({ name: FONTE, size, bold: true, color: { argb: 'FF000000' } });
const centro: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' };

/** Escreve um valor numa coluna (mesclando quando ela ocupa duas) com o estilo em todas as células. */
function celula(ws: ExcelJS.Worksheet, linha: number, col: number, span: number, valor: ExcelJS.CellValue, estilo: Partial<ExcelJS.Style>) {
  if (span > 1) ws.mergeCells(linha, col, linha, col + span - 1);
  for (let i = 0; i < span; i++) ws.getCell(linha, col + i).style = { ...estilo, border: estilo.border ?? BORDA };
  ws.getCell(linha, col).value = valor;
}

function abaDoDia(wb: ExcelJS.Workbook, dia: string, ops: Op[], fats: Fat[] | null) {
  const ws = wb.addWorksheet(br(dia).replace(/\//g, '.'), {
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const cols = colunasDoDia(ops);
  const inicio: number[] = [];
  let n = 1;
  for (const c of cols) {
    inicio.push(n);
    c.largura.forEach((w, i) => (ws.getColumn(n + i).width = w));
    n += c.largura.length;
  }
  const letra = (i: number) => ws.getColumn(inicio[i]).letter;

  // título "OPERAÇÃO dd/mm/aaaa" nas 3 primeiras colunas, como na planilha
  ws.getRow(1).height = 30;
  celula(ws, 1, 1, inicio[3] - 1, `OPERAÇÃO ${br(dia)}`, { font: fonte(24), fill: CINZA, alignment: centro });

  ws.getRow(2).height = 20;
  cols.forEach((c, i) => celula(ws, 2, inicio[i], c.largura.length, c.titulo, { font: fonte(c.tamTitulo), alignment: centro }));

  let l = 3;
  for (const o of ops) {
    ws.getRow(l).height = 17.5;
    cols.forEach((c, i) => {
      const v = c.campo === 'nome' ? o.nome_original : o[c.campo];
      celula(ws, l, inicio[i], c.largura.length, c.zeroVazio && !v ? null : v, {
        font: fonte(c.campo === 'nome' ? 10 : 14),
        alignment: centro,
        ...(c.campo === 'nome' ? {} : { numFmt: MOEDA }),
      });
    });
    l++;
  }

  // total em amarelo, com fórmula (quem mexer no Excel vê a soma atualizar)
  const ultima = l - 1;
  ws.getRow(l).height = 20;
  cols.forEach((c, i) => {
    if (c.campo === 'nome') return celula(ws, l, inicio[i], c.largura.length, null, { font: fonte(16), alignment: centro });
    const campo = c.campo;
    const soma = Math.round(ops.reduce((s, o) => s + o[campo], 0) * 100) / 100;
    celula(ws, l, inicio[i], c.largura.length, { formula: `SUM(${letra(i)}3:${letra(i)}${ultima})`, result: soma }, {
      font: fonte(14),
      alignment: centro,
      numFmt: MOEDA,
      fill: AMARELO,
    });
  });

  if (!fats) return;
  l += 3;
  ws.getRow(l).height = 20;
  celula(ws, l, 1, 2, 'FATURAMENTO', { font: fonte(12), alignment: centro });
  celula(ws, l, 3, 2, 'VALOR', { font: fonte(16), alignment: centro });
  const primeiraFat = l + 1;
  for (const f of fats) {
    l++;
    ws.getRow(l).height = 17.5;
    celula(ws, l, 1, 2, f.data_faturamento ? dataExcel(f.data_faturamento) : null, { font: fonte(12), alignment: centro, numFmt: 'dd/mm/yyyy' });
    celula(ws, l, 3, 2, f.valor, { font: fonte(14), alignment: centro, numFmt: MOEDA });
  }
  l++;
  ws.getRow(l).height = 18;
  const total = Math.round(fats.reduce((s, f) => s + f.valor, 0) * 100) / 100;
  celula(ws, l, 3, 2, fats.length ? { formula: `SUM(C${primeiraFat}:C${l - 1})`, result: total } : 0, {
    font: fonte(14),
    alignment: centro,
    numFmt: MOEDA,
    fill: AMARELO,
    border: { left: medio, right: medio, bottom: medio, top: fino },
  });
}

/**
 * Exporta as operações FIDC de um dia ou período (?de=AAAA-MM-DD&ate=AAAA-MM-DD) no mesmo modelo
 * da planilha do financeiro: uma aba por dia ("dd.mm.aaaa") com a operação e o faturamento.
 * Opcional: só uma FIDC (?fidc=) e/ou empresa (?empresa=); aí sem faturamento, que não é separado por FIDC.
 */
export async function GET(request: Request) {
  await requireFidc();
  const url = new URL(request.url);
  const de = url.searchParams.get('de') ?? '';
  const ate = url.searchParams.get('ate') || de;
  const fidc = url.searchParams.get('fidc') ?? '';
  const empresa = url.searchParams.get('empresa') ?? '';
  if (!DATA.test(de) || !DATA.test(ate)) return new Response('Escolha o dia ou o período para exportar.', { status: 400 });
  if (ate < de) return new Response('A data final é antes da inicial.', { status: 400 });

  const db = createServiceRoleClient();
  const ops = (
    await buscarTodas<Op>((i, f) => {
      let q = db
        .from('fidc_operacoes')
        .select('data,ordem,nome_original,valor_operacao,bruto,recompras,refaturamento,nota_troca,substituicao,prorrogacao,desconto,despesas,liquido')
        .gte('data', de)
        .lte('data', ate);
      if (fidc) q = q.eq('fidc', fidc);
      if (empresa) q = q.eq('empresa', empresa);
      return q.order('data').order('ordem').range(i, f);
    })
  ).map((o) => ({
    ...o,
    valor_operacao: num(o.valor_operacao),
    bruto: num(o.bruto),
    recompras: num(o.recompras),
    refaturamento: num(o.refaturamento),
    nota_troca: num(o.nota_troca),
    substituicao: num(o.substituicao),
    prorrogacao: num(o.prorrogacao),
    desconto: num(o.desconto),
    despesas: num(o.despesas),
    liquido: num(o.liquido),
  }));
  if (!ops.length) return new Response('Não tem operação nesse dia/período.', { status: 404 });

  const comFaturamento = !fidc && !empresa;
  const fats = comFaturamento
    ? (
        await buscarTodas<Fat>((i, f) =>
          db
            .from('fidc_faturamentos')
            .select('data_operacao,data_faturamento,valor')
            .gte('data_operacao', de)
            .lte('data_operacao', ate)
            .order('data_operacao')
            .order('ordem')
            .range(i, f)
        )
      ).map((x) => ({ ...x, valor: num(x.valor) }))
    : [];

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Natuhair';
  const dias = [...new Set(ops.map((o) => o.data))].sort();
  for (const dia of dias)
    abaDoDia(
      wb,
      dia,
      ops.filter((o) => o.data === dia),
      comFaturamento ? fats.filter((f) => f.data_operacao === dia) : null
    );

  const periodo = de === ate ? br(de) : `${br(de)} a ${br(ate)}`;
  const filtro = [fidc, empresa].filter(Boolean).join(' - ');
  const nome = `operações ${periodo}${filtro ? ` ${filtro}` : ''}.xlsx`.replace(/\//g, '.');
  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nome.normalize('NFD').replace(/[^\x20-\x7e]/g, '')}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
    },
  });
}
