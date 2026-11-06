import ExcelJS from 'exceljs';
import { requireNfe } from '@/lib/auth';
import {
  LIMITE_EXCEL,
  buscarEmitidas,
  buscarEntradas,
  buscarNaoLancadas,
  lerFiltros,
  nomesEmpresas,
  periodoInvertido,
} from '@/lib/nfe/dados';

export const dynamic = 'force-dynamic';

const MOEDA = '"R$" #,##0.00';
const SITUACAO = { autorizada: 'Autorizada', cancelada: 'Cancelada', pendente: 'Sem autorização' } as const;
const data = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`) : null);

/**
 * Excel da lista da aba NFE (?aba=emitidas|entradas|naolancadas), com a busca e os filtros da
 * tela (sem eles, as notas mais recentes), até LIMITE_EXCEL linhas.
 */
export async function GET(request: Request) {
  await requireNfe();
  const url = new URL(request.url);
  const f = lerFiltros(Object.fromEntries(url.searchParams));
  if (periodoInvertido(f)) return new Response('A data final é antes da inicial.', { status: 400 });
  const aba = url.searchParams.get('aba');
  const empresas = await nomesEmpresas();
  const empresa = (id: string) => empresas.get(id) ?? id;

  const wb = new ExcelJS.Workbook();
  let nome: string;
  if (aba === 'entradas') {
    nome = 'Entradas';
    const ws = wb.addWorksheet(nome, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
      { header: 'Lançamento', key: 'lancamento', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
      { header: 'Emissão', key: 'emissao', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
      { header: 'Nº nota', key: 'numero', width: 12 },
      { header: 'Série', key: 'serie', width: 7 },
      { header: 'Empresa', key: 'empresa', width: 26 },
      { header: 'Fornecedor', key: 'fornecedor', width: 42 },
      { header: 'CNPJ', key: 'cnpj', width: 20 },
      { header: 'Operação', key: 'operacao', width: 28 },
      { header: 'Valor', key: 'valor', width: 15, style: { numFmt: MOEDA } },
      { header: 'Gerou conta a pagar', key: 'cp', width: 12 },
      { header: 'Chave', key: 'chave', width: 48 },
    ];
    for (const n of await buscarEntradas(f, LIMITE_EXCEL)) {
      ws.addRow({ ...n, lancamento: data(n.lancamento), emissao: data(n.emissao), empresa: empresa(n.empresaId), cp: n.geradoCp ? 'Sim' : n.geraCp ? 'Ainda não' : 'Não gera' });
    }
  } else if (aba === 'naolancadas') {
    nome = 'Nao lancadas';
    const ws = wb.addWorksheet(nome, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
      { header: 'Emissão', key: 'emissao', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
      { header: 'Recebida no ERP', key: 'recebimento', width: 17 },
      { header: 'Nº nota', key: 'numero', width: 12 },
      { header: 'Empresa', key: 'empresa', width: 26 },
      { header: 'Fornecedor', key: 'fornecedor', width: 42 },
      { header: 'CNPJ', key: 'cnpj', width: 20 },
      { header: 'Valor', key: 'valor', width: 15, style: { numFmt: MOEDA } },
      { header: 'Status no ERP', key: 'status', width: 14 },
      { header: 'Chave', key: 'chave', width: 48 },
    ];
    for (const n of await buscarNaoLancadas(f, LIMITE_EXCEL)) ws.addRow({ ...n, emissao: data(n.emissao), empresa: empresa(n.empresaId) });
  } else {
    nome = 'Emitidas';
    const ws = wb.addWorksheet(nome, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
      { header: 'Emissão', key: 'emissao', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
      { header: 'Nº nota', key: 'numero', width: 11 },
      { header: 'Série', key: 'serie', width: 7 },
      { header: 'Tipo', key: 'tipoTexto', width: 9 },
      { header: 'Empresa', key: 'empresa', width: 26 },
      { header: 'Destinatário', key: 'destinatario', width: 42 },
      { header: 'CNPJ/CPF', key: 'documento', width: 20 },
      { header: 'UF', key: 'uf', width: 5 },
      { header: 'Natureza da operação', key: 'natureza', width: 30 },
      { header: 'Valor', key: 'valor', width: 15, style: { numFmt: MOEDA } },
      { header: 'Situação', key: 'situacaoTexto', width: 16 },
      { header: 'Protocolo', key: 'protocolo', width: 18 },
      { header: 'Chave', key: 'chave', width: 48 },
    ];
    for (const n of await buscarEmitidas(f, LIMITE_EXCEL)) {
      ws.addRow({ ...n, emissao: data(n.emissao), empresa: empresa(n.empresaId), tipoTexto: n.tipo === 'saida' ? 'Saída' : 'Entrada', situacaoTexto: SITUACAO[n.situacao] });
    }
  }

  const ws = wb.worksheets[0];
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };
  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="NFE ${nome}${f.de || f.ate ? ` ${f.de || 'inicio'} a ${f.ate || 'hoje'}` : ''}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
