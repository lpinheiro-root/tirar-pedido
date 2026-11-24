import ExcelJS from 'exceljs';
import { requireInadimplencia } from '@/lib/auth';
import { buscarVencidos } from '@/lib/inadimplencia/dados';
import { FAIXAS, TIPOS_CARTEIRA, faixaDe, filtrar, type Filtros, type TituloVencido } from '@/lib/inadimplencia/comum';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const MOEDA = '_-[$R$-416] * #,##0.00_-;-[$R$-416] * #,##0.00_-;_-[$R$-416] * "-"??_-;_-@_-';
const AZUL = 'FF071D7B';
const data = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`) : null);
const soma = (ts: TituloVencido[]) => Math.round(ts.reduce((s, t) => s + t.saldo, 0) * 100) / 100;
const TIPO = Object.fromEntries(TIPOS_CARTEIRA.map((t) => [t.id, t.rotulo]));

function cabecalho(ws: ExcelJS.Worksheet) {
  const r = ws.getRow(1);
  r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  r.height = 20;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
}

/** Excel da inadimplência com os mesmos filtros da tela (?grupo=1&empresa=&tipo=&fidc=&faixa=&vendedor=&busca=). */
export async function GET(request: Request) {
  await requireInadimplencia();
  const p = new URL(request.url).searchParams;
  const f: Filtros = {
    empresa: p.get('empresa') ?? '',
    tipo: (p.get('tipo') ?? '') as Filtros['tipo'],
    fidc: p.get('fidc') ?? '',
    faixa: (p.get('faixa') ?? '') as Filtros['faixa'],
    vendedor: p.get('vendedor') ?? '',
    busca: p.get('busca') ?? '',
  };
  let ts: TituloVencido[];
  try {
    ts = filtrar(await buscarVencidos(p.get('grupo') === '1'), f);
  } catch (e) {
    return new Response(`Não consegui ler o ORGM: ${e instanceof Error ? e.message : String(e)}`, { status: 500 });
  }

  const wb = new ExcelJS.Workbook();

  // Resumo: empresa × faixa de atraso
  const r = wb.addWorksheet('Resumo por empresa');
  r.columns = [
    { header: 'Empresa', key: 'empresa', width: 22 },
    { header: 'Títulos', key: 'qtd', width: 9 },
    ...FAIXAS.map((x) => ({ header: x.rotulo, key: x.id, width: 16, style: { numFmt: MOEDA } })),
    { header: 'Total', key: 'total', width: 17, style: { numFmt: MOEDA } },
  ];
  const empresas = new Map<string, TituloVencido[]>();
  ts.forEach((t) => empresas.set(t.empresa, [...(empresas.get(t.empresa) ?? []), t]));
  const linhaResumo = (nome: string, l: TituloVencido[]) => ({
    empresa: nome,
    qtd: l.length,
    ...Object.fromEntries(FAIXAS.map((x) => [x.id, soma(l.filter((t) => faixaDe(t.dias) === x.id))])),
    total: soma(l),
  });
  Array.from(empresas.entries())
    .sort((a, b) => soma(b[1]) - soma(a[1]))
    .forEach(([nome, l]) => r.addRow(linhaResumo(nome, l)));
  r.addRow(linhaResumo('Total', ts)).font = { bold: true };
  cabecalho(r);

  // Clientes
  const c = wb.addWorksheet('Clientes');
  c.columns = [
    { header: 'Cliente', key: 'cliente', width: 40 },
    { header: 'CNPJ/CPF', key: 'cnpj', width: 20 },
    { header: 'Empresa', key: 'empresa', width: 20 },
    { header: 'Títulos', key: 'qtd', width: 9 },
    { header: 'Maior atraso (dias)', key: 'maior', width: 12 },
    { header: 'Total vencido', key: 'total', width: 17, style: { numFmt: MOEDA } },
  ];
  const clientes = new Map<string, TituloVencido[]>();
  ts.forEach((t) => clientes.set(`${t.empresaId}|${t.clienteCod}`, [...(clientes.get(`${t.empresaId}|${t.clienteCod}`) ?? []), t]));
  Array.from(clientes.values())
    .sort((a, b) => soma(b) - soma(a))
    .forEach((l) =>
      c.addRow({ cliente: l[0].cliente, cnpj: l[0].cnpj, empresa: l[0].empresa, qtd: l.length, maior: Math.max(...l.map((t) => t.dias)), total: soma(l) })
    );
  cabecalho(c);

  // Títulos
  const t = wb.addWorksheet('Títulos');
  t.columns = [
    { header: 'Empresa', key: 'empresa', width: 20 },
    { header: 'Documento', key: 'documento', width: 12 },
    { header: 'Cliente', key: 'cliente', width: 40 },
    { header: 'CNPJ/CPF', key: 'cnpj', width: 20 },
    { header: 'Emissão', key: 'emissao', width: 11, style: { numFmt: 'dd/mm/yyyy' } },
    { header: 'Vencimento', key: 'vencimento', width: 11, style: { numFmt: 'dd/mm/yyyy' } },
    { header: 'Dias de atraso', key: 'dias', width: 10 },
    { header: 'Faixa', key: 'faixa', width: 15 },
    { header: 'Valor', key: 'valor', width: 15, style: { numFmt: MOEDA } },
    { header: 'Pago', key: 'pago', width: 14, style: { numFmt: MOEDA } },
    { header: 'Saldo', key: 'saldo', width: 15, style: { numFmt: MOEDA } },
    { header: 'Onde está', key: 'tipo', width: 18 },
    { header: 'FIDC', key: 'fidc', width: 12 },
    { header: 'Carteira ORGM', key: 'carteira', width: 34 },
    { header: 'Vendedor', key: 'vendedor', width: 22 },
  ];
  for (const x of ts)
    t.addRow({
      ...x,
      emissao: data(x.emissao),
      vencimento: data(x.vencimento),
      faixa: FAIXAS.find((y) => y.id === faixaDe(x.dias))?.rotulo,
      tipo: TIPO[x.tipoCarteira],
    });
  cabecalho(t);

  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }).replace(/\//g, '.');
  const nome = `inadimplência ${hoje}.xlsx`;
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="inadimplencia ${hoje}.xlsx"; filename*=UTF-8''${encodeURIComponent(nome)}`,
    },
  });
}
