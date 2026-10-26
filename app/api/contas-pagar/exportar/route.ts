import { requireContasPagar } from '@/lib/auth';
import {
  CATEGORIAS,
  MAX_DIAS,
  aplicarFiltros,
  buscarTitulos,
  categoria,
  diasNoPeriodo,
  lerFiltros,
  porConta,
  porFavorecido,
  porPeriodo,
} from '@/lib/contasPagar/dados';

export const dynamic = 'force-dynamic';

const MOEDA = '"R$" #,##0.00';
const ROTULO = Object.fromEntries(CATEGORIAS.map((c) => [c.id, c.rotulo])) as Record<string, string>;

/** Excel da consulta de Contas a Pagar, com os mesmos filtros da tela. */
export async function GET(request: Request) {
  await requireContasPagar();
  const url = new URL(request.url);
  const entrada: Record<string, string> = {};
  url.searchParams.forEach((_, k) => (entrada[k] = url.searchParams.getAll(k).join(',')));
  const f = lerFiltros(entrada);
  if (diasNoPeriodo(f) < 1 || diasNoPeriodo(f) > MAX_DIAS) {
    return new Response(`Escolha um período de até ${MAX_DIAS} dias.`, { status: 400 });
  }

  const titulos = aplicarFiltros(await buscarTitulos(f.de, f.ate), f);
  const cats = CATEGORIAS.filter((c) => f.categorias.includes(c.id));

  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Natuhair Finanças';
  const cabecalho = (ws: import('exceljs').Worksheet) => {
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  };
  const moeda = (ws: import('exceljs').Worksheet, de: number) => {
    for (let c = de; c <= ws.columnCount; c++) ws.getColumn(c).numFmt = MOEDA;
  };

  // por período
  const nome = f.agrupar === 'dia' ? 'Dia' : f.agrupar === 'semana' ? 'Semana' : 'Mês';
  const p = wb.addWorksheet(`Por ${nome.toLowerCase()}`);
  p.columns = [
    { header: `${nome} (vencimento)`, width: 20 },
    ...cats.map((c) => ({ header: c.rotulo, width: 16 })),
    { header: 'Total', width: 16 },
    { header: 'Pago', width: 16 },
    { header: 'Saldo', width: 16 },
  ];
  for (const l of porPeriodo(titulos, f.agrupar)) {
    p.addRow([l.rotulo, ...cats.map((c) => l.cat[c.id].valor), l.total.valor, l.total.pago, l.total.saldo]);
  }
  const ultima = p.rowCount;
  if (ultima > 1) {
    const total = p.addRow(['Total']);
    for (let c = 2; c <= cats.length + 4; c++) {
      const letra = p.getColumn(c).letter;
      total.getCell(c).value = { formula: `SUM(${letra}2:${letra}${ultima})` };
    }
    total.font = { bold: true };
  }
  cabecalho(p);
  moeda(p, 2);

  // contas contábeis
  const c = wb.addWorksheet('Contas contábeis');
  c.columns = [
    { header: 'Categoria', width: 15 },
    { header: 'Conta contábil pai', width: 32 },
    { header: 'Conta contábil', width: 40 },
    { header: 'Títulos', width: 9 },
    { header: 'Valor original', width: 16 },
    { header: 'Pago', width: 16 },
    { header: 'Saldo', width: 16 },
  ];
  for (const l of porConta(titulos)) {
    c.addRow([ROTULO[categoria(l)], l.contaPai, l.conta, l.total.titulos, l.total.valor, l.total.pago, l.total.saldo]);
  }
  cabecalho(c);
  moeda(c, 5);

  // favorecidos
  const fv = wb.addWorksheet('Favorecidos');
  fv.columns = [
    { header: 'Favorecido', width: 45 },
    { header: 'Categorias', width: 30 },
    { header: 'Títulos', width: 9 },
    { header: 'Valor original', width: 16 },
    { header: 'Pago', width: 16 },
    { header: 'Saldo', width: 16 },
  ];
  for (const l of porFavorecido(titulos)) {
    fv.addRow([l.favorecido, Array.from(l.categorias).map((x) => ROTULO[x]).join(', '), l.total.titulos, l.total.valor, l.total.pago, l.total.saldo]);
  }
  cabecalho(fv);
  moeda(fv, 4);

  // títulos
  const t = wb.addWorksheet('Títulos');
  t.columns = [
    { header: 'Vencimento', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
    { header: 'Emissão', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
    { header: 'Empresa', width: 32 },
    { header: 'Favorecido', width: 40 },
    { header: 'Documento', width: 14 },
    { header: 'Espécie', width: 12 },
    { header: 'Histórico', width: 40 },
    { header: 'Categoria', width: 14 },
    { header: 'Conta contábil pai', width: 28 },
    { header: 'Conta contábil', width: 34 },
    { header: 'Fornecedor do grupo', width: 10 },
    { header: 'Valor', width: 14, style: { numFmt: MOEDA } },
    { header: 'Pago', width: 14, style: { numFmt: MOEDA } },
    { header: 'Saldo', width: 14, style: { numFmt: MOEDA } },
  ];
  const data = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`) : null);
  for (const x of titulos) {
    t.addRow([
      data(x.vencimento),
      data(x.emissao),
      x.empresa,
      x.favorecido,
      x.documento,
      x.especie,
      x.historico,
      ROTULO[categoria(x)],
      x.contaPai,
      x.conta,
      x.fornecedorDoGrupo ? 'Sim' : '',
      x.valor,
      x.pago,
      x.saldo,
    ]);
  }
  cabecalho(t);
  t.autoFilter = { from: 'A1', to: 'N1' };

  const dados = new Uint8Array(await wb.xlsx.writeBuffer());
  return new Response(dados, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Contas a pagar ${f.de} a ${f.ate}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
