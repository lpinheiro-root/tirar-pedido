import ExcelJS from 'exceljs';
import { requireNaoAntecipados } from '@/lib/auth';
import { buscarNaoAntecipados } from '@/lib/naoAntecipados/dados';
import { dataValida, filtrar, type FiltrosNaoAntecipados } from '@/lib/naoAntecipados/comum';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

// mesmas colunas e larguras do Excel que o ORGM baixa no dashboard (DASH_1153.xlsx, aba TÍTULOS COBRANÇA)
const COLUNAS: [string, number][] = [
  ['finMovID', 9.72],
  ['NomeEmpresa', 19.92],
  ['CNPJ', 19.22],
  ['CLIENTE', 61.33],
  ['ContaNome', 41.72],
  ['Historico', 109.73],
  ['ValorOriginal', 13],
  ['Saldo', 9.8],
  ['DOCTO', 10.54],
  ['Emissao', 11.95],
  ['Vencimento', 12.16],
  ['Venda', 7.28],
  ['Vendedor', 27.61],
];
const data = (iso: string | null) => (iso ? new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))) : null);

/** Excel dos clientes não antecipados com os filtros da tela (?de=&ate=&empresa=&carteira=&vendedor=&venda=&busca=). */
export async function GET(request: Request) {
  await requireNaoAntecipados();
  const p = new URL(request.url).searchParams;
  const de = dataValida(p.get('de'));
  const ate = dataValida(p.get('ate'));
  const f: FiltrosNaoAntecipados = {
    empresa: p.get('empresa') ?? '',
    cliente: p.get('cliente') ?? '',
    carteira: p.get('carteira') ?? '',
    vendedor: p.get('vendedor') ?? '',
    venda: (p.get('venda') ?? '') as FiltrosNaoAntecipados['venda'],
    busca: p.get('busca') ?? '',
  };
  let ts;
  try {
    ts = filtrar(await buscarNaoAntecipados(de, ate), f);
  } catch (e) {
    return new Response(`Não consegui ler o ORGM: ${e instanceof Error ? e.message : String(e)}`, { status: 500 });
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Planilha1');
  ws.columns = COLUNAS.map(([header, width]) => ({ header, width }));
  for (const t of ts) {
    ws.addRow([
      t.finMovId,
      t.empresa,
      t.cnpj,
      t.cliente,
      t.contaNome || null,
      t.historico,
      t.valorOriginal,
      t.saldo,
      // o ORGM devolve '<documento>' e o Excel come o primeiro apóstrofo
      `${t.documento}'`,
      data(t.emissao),
      data(t.vencimento),
      t.venda,
      t.vendedor || null,
    ]);
  }
  ws.getColumn(10).numFmt = 'mm-dd-yy';
  ws.getColumn(11).numFmt = 'mm-dd-yy';
  ws.getRow(1).numFmt = 'General';

  const nome = `Clientes nao antecipados${de || ate ? ` ${de || 'inicio'} a ${ate || 'hoje'}` : ''}.xlsx`;
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nome}"`,
    },
  });
}
