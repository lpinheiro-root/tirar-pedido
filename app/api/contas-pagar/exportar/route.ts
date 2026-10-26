import { requireContasPagar } from '@/lib/auth';
import { CATEGORIAS, MAX_DIAS, aplicarFiltros, buscarTitulos, categoria, diasNoPeriodo, lerFiltros } from '@/lib/contasPagar/dados';
import { planilhaEmAberto } from '@/lib/contasPagar/planilhaEmAberto';

export const dynamic = 'force-dynamic';

const MOEDA = '"R$" #,##0.00';
const ROTULO = Object.fromEntries(CATEGORIAS.map((c) => [c.id, c.rotulo])) as Record<string, string>;

/**
 * Excel no formato da planilha "materia prima e embalagem-em aberto" (valores em
 * aberto de embalagem, matéria-prima e frete por dia, duas semanas por aba),
 * com o período, a empresa e o filtro de fornecedores do grupo da tela.
 * No fim, a aba "Títulos" com os títulos em aberto que formam os valores.
 */
export async function GET(request: Request) {
  await requireContasPagar();
  const url = new URL(request.url);
  const entrada: Record<string, string> = {};
  url.searchParams.forEach((_, k) => (entrada[k] = url.searchParams.getAll(k).join(',')));
  const f = lerFiltros(entrada);
  if (diasNoPeriodo(f) < 1 || diasNoPeriodo(f) > MAX_DIAS) {
    return new Response(`Escolha um período de até ${MAX_DIAS} dias.`, { status: 400 });
  }

  // a planilha é sempre "em aberto" e sempre com as três colunas
  const titulos = aplicarFiltros(await buscarTitulos(f.de, f.ate), {
    ...f,
    situacao: 'aberto',
    categorias: ['embalagem', 'materia_prima', 'frete'],
  });
  const wb = await planilhaEmAberto(titulos, f.de, f.ate);

  const t = wb.addWorksheet('Títulos');
  t.columns = [
    { header: 'Vencimento', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
    { header: 'Empresa', width: 32 },
    { header: 'Favorecido', width: 40 },
    { header: 'Documento', width: 14 },
    { header: 'Espécie', width: 12 },
    { header: 'Histórico', width: 40 },
    { header: 'Categoria', width: 14 },
    { header: 'Conta contábil pai', width: 28 },
    { header: 'Conta contábil', width: 34 },
    { header: 'Valor', width: 14, style: { numFmt: MOEDA } },
    { header: 'Pago', width: 14, style: { numFmt: MOEDA } },
    { header: 'Saldo em aberto', width: 16, style: { numFmt: MOEDA } },
  ];
  t.getRow(1).font = { bold: true };
  t.views = [{ state: 'frozen', ySplit: 1 }];
  for (const x of titulos) {
    t.addRow([
      new Date(`${x.vencimento}T12:00:00`),
      x.empresa,
      x.favorecido,
      x.documento,
      x.especie,
      x.historico,
      ROTULO[categoria(x)],
      x.contaPai,
      x.conta,
      x.valor,
      x.pago,
      x.saldo,
    ]);
  }
  t.autoFilter = { from: 'A1', to: 'L1' };

  const dados = new Uint8Array(await wb.xlsx.writeBuffer());
  return new Response(dados, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="materia prima e embalagem-em aberto ${f.de} a ${f.ate}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
