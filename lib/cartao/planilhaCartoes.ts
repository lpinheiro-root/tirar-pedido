import type ExcelJS from 'exceljs';
import { BANCO_LABEL, ORIGEM_LABEL, STATUS_LANCAMENTO, TIPO_LABEL, type StatusLancamento } from './rotulos';
import type { MemoriaCartoes } from './classificacoes';

/**
 * Excel no formato da planilha "Cartões" do financeiro: uma aba por empresa e,
 * em cada aba, um bloco por fatura —
 *   Fatura-cartão VENEZA 10/09/2026
 *   Despesas                           | Conta contábil
 *   valor | parcela (06a/10) | estabelecimento | descrição | conta contábil
 *   =SOMA  /  Total
 * A conta contábil fica em branco para a equipe preencher.
 */

export interface FaturaPlanilha {
  id: string;
  banco: string;
  arquivo_nome: string;
  vencimento: string | null;
  criado_em: string;
}

export interface LancamentoPlanilha {
  data: string;
  descricao: string;
  valor: number;
  tipo: string;
  parcela_atual: number | null;
  parcela_total: number | null;
  cartao_final: string | null;
  status: string;
  vinculo: string | null;
  diferenca: number | null;
  observacao: string | null;
  cartao_compras: Record<string, unknown> | null;
}

const MOEDA = '"R$" #,##0.00';
const BORDA: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};
const dois = (n: number) => String(n).padStart(2, '0');
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Nome da empresa pelo nome do arquivo ("fatura Veneza 09-26.pdf" → "VENEZA"). */
export function empresaDaFatura(f: FaturaPlanilha): string {
  const nome = f.arquivo_nome
    .replace(/\.pdf$/i, '')
    .replace(/fatura|cart[aã]o|santander|empresas?|mastercard|visa|elo/gi, ' ')
    .replace(/[\d_\-./()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (nome || BANCO_LABEL[f.banco] || f.banco).toUpperCase();
}

// cidade que a fatura cola no fim do estabelecimento (às vezes cortada pelo OCR: "ao Paulo", "sascol")
const CIDADE_NO_FIM =
  /\s+(?:S?[AÃ]O PAULO|AO PAULO|O?S?ASCO\w?|CURITIBA\w?|RIO DE JANEI\w*|NOVA IGUA\w*|MESQUITA\w?|BELO HORIZON\w*|BARUER\w*|SAN FRANCISCO|HELSINKI|MILTON KEYNES|COIMBRA|JOINVILLE?\w?|CUIABA\w?|PORTO ALEGRE|SOROCABA\w?|PINHAIS\w?|S?8?SANTO ANDRE\w?|JAGUARIUNA|MIRASSOL|CATAGUASES\w?|SAO JOSE DOS\w*|NOVA IGUAU\w?)$/i;

/** "HOTEIS COM ao Paulo)" → "HOTEIS COM" */
function nomeDaFatura(l: LancamentoPlanilha): string {
  const limpo = l.descricao.replace(/[\s)|!\\/“”"']+$/g, '').trim();
  return limpo.replace(CIDADE_NO_FIM, '').trim() || limpo;
}

/**
 * Colunas C (estabelecimento), D (descrição) e E (conta contábil), como a equipe
 * preenche: primeiro o que já foi escrito para a mesma compra (parcelas
 * anteriores), depois o pedido do Mercado Livre vinculado, depois o que se usa
 * para aquele estabelecimento. O que não houver fica em branco para preencher.
 */
function colunasCDE(l: LancamentoPlanilha, empresa: string, memoria: MemoriaCartoes | null) {
  const s = memoria?.sugerir(empresa, l.descricao, Number(l.valor), l.parcela_atual, l.parcela_total);
  const c = l.cartao_compras;
  const extras = [
    l.tipo !== 'compra' && l.tipo !== 'estorno' ? (TIPO_LABEL[l.tipo] ?? '') : '',
    l.observacao ?? '',
  ].filter(Boolean);

  if (s?.fonte === 'parcela') {
    return {
      estab: s.estabelecimento ?? nomeDaFatura(l),
      desc: s.descricao,
      conta: s.conta,
    };
  }
  if (c?.origem === 'mercadolivre') {
    const produto = String(c.descricao ?? '').replace(/\s*\(pedidos?\s[^)]*\)\s*$/i, '');
    return {
      estab: 'Mercado Livre',
      desc: [produto, ...extras].filter(Boolean).join(' - ').toUpperCase() || null,
      conta: s?.conta ?? null,
    };
  }
  const desc = [s?.descricao ?? (c ? String(c.descricao ?? c.loja ?? '') : ''), ...extras].filter(Boolean).join(' - ');
  return {
    estab: s?.estabelecimento ?? nomeDaFatura(l),
    desc: desc ? desc.toUpperCase() : null,
    conta: s?.conta ?? null,
  };
}

/** Escreve o bloco de uma fatura a partir da linha `inicio`; devolve a próxima linha livre. */
function escreverBloco(
  ws: ExcelJS.Worksheet,
  inicio: number,
  empresa: string,
  f: FaturaPlanilha,
  lancs: LancamentoPlanilha[],
  memoria: MemoriaCartoes | null
) {
  let r = inicio;
  const titulo = ws.getRow(r);
  titulo.getCell(1).value = `Fatura-cartão ${empresa} ${f.vencimento ? br(f.vencimento) : br(f.criado_em)}`;
  ws.mergeCells(r, 1, r, 5);
  titulo.getCell(1).font = { bold: true, size: 11 };
  titulo.getCell(1).alignment = { horizontal: 'center' };
  for (let c = 1; c <= 5; c++) titulo.getCell(c).border = BORDA;
  r++;

  const cab = ws.getRow(r);
  cab.getCell(1).value = 'Despesas ';
  ws.mergeCells(r, 1, r, 4);
  cab.getCell(5).value = 'Conta contábil';
  for (let c = 1; c <= 5; c++) {
    cab.getCell(c).font = { bold: true, size: 11 };
    cab.getCell(c).alignment = { horizontal: 'center' };
    cab.getCell(c).border = BORDA;
  }
  r++;

  const primeira = r;
  for (const l of lancs.filter((x) => x.tipo !== 'pagamento')) {
    const row = ws.getRow(r);
    row.getCell(1).value = Number(l.valor);
    row.getCell(1).numFmt = MOEDA;
    row.getCell(2).value =
      l.parcela_atual && l.parcela_total ? `${dois(l.parcela_atual)}a/${dois(l.parcela_total)}` : null;
    row.getCell(2).alignment = { horizontal: 'center' };
    const cde = colunasCDE(l, empresa, memoria);
    row.getCell(3).value = cde.estab;
    row.getCell(4).value = cde.desc;
    row.getCell(5).value = cde.conta;
    row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(5).alignment = { horizontal: 'center' };
    for (let c = 1; c <= 5; c++) row.getCell(c).border = BORDA;
    r++;
  }
  const ultima = r - 1;
  const soma = lancs.filter((x) => x.tipo !== 'pagamento').reduce((s, l) => s + Number(l.valor), 0);

  r++; // linha em branco, como na planilha
  const linhaSoma = r;
  ws.getCell(linhaSoma, 1).value = ultima >= primeira ? { formula: `SUM(A${primeira}:A${ultima})`, result: soma } : 0;
  ws.getCell(linhaSoma, 1).numFmt = MOEDA;
  ws.getCell(linhaSoma, 1).font = { bold: true };
  r += 2;
  ws.getCell(r, 1).value = 'Total';
  ws.getCell(r, 1).font = { bold: true };
  ws.getCell(r, 2).value = { formula: `A${linhaSoma}`, result: soma };
  ws.getCell(r, 2).numFmt = MOEDA;
  ws.getCell(r, 2).font = { bold: true };
  return r + 4; // espaço até o próximo bloco
}

function abaEmpresa(wb: ExcelJS.Workbook, empresa: string) {
  const nome = `Cartão ${empresa.charAt(0)}${empresa.slice(1).toLowerCase()}`.slice(0, 31);
  const ws = wb.getWorksheet(nome) ?? wb.addWorksheet(nome);
  ws.columns = [{ width: 18.5 }, { width: 13.5 }, { width: 34 }, { width: 80 }, { width: 24 }];
  return ws;
}

/** Aba com o detalhe da conciliação (lançamento × compra no site). */
function abaConciliacao(wb: ExcelJS.Workbook, lancs: LancamentoPlanilha[]) {
  const ws = wb.addWorksheet('Conciliação');
  ws.columns = [
    { header: 'Data', key: 'data', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
    { header: 'Lançamento', key: 'lanc', width: 40 },
    { header: 'Parcela', key: 'parcela', width: 9 },
    { header: 'Final cartão', key: 'final', width: 12 },
    { header: 'Tipo', key: 'tipo', width: 12 },
    { header: 'Valor', key: 'valor', width: 14, style: { numFmt: MOEDA } },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Vínculo', key: 'vinculo', width: 11 },
    { header: 'Diferença', key: 'dif', width: 12, style: { numFmt: MOEDA } },
    { header: 'Compra - site', key: 'site', width: 15 },
    { header: 'Compra - conta', key: 'conta', width: 18 },
    {
      header: 'Compra - data',
      key: 'cdata',
      width: 13,
      style: { numFmt: 'dd/mm/yyyy' },
    },
    { header: 'Compra - descrição', key: 'cdesc', width: 50 },
    { header: 'Compra - pedido', key: 'pedido', width: 22 },
    {
      header: 'Compra - valor total',
      key: 'ctotal',
      width: 16,
      style: { numFmt: MOEDA },
    },
    { header: 'Observação', key: 'obs', width: 30 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const data = (iso: string | null | undefined) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`) : null);
  for (const l of lancs) {
    const c = l.cartao_compras;
    const pedidos = c?.pedidos as string[] | null | undefined;
    ws.addRow({
      data: data(l.data),
      lanc: l.descricao,
      parcela: l.parcela_atual ? `${l.parcela_atual}/${l.parcela_total}` : '',
      final: l.cartao_final ?? '',
      tipo: TIPO_LABEL[l.tipo] ?? l.tipo,
      valor: Number(l.valor),
      status: l.tipo === 'compra' ? (STATUS_LANCAMENTO[l.status as StatusLancamento]?.label ?? l.status) : '',
      vinculo: l.vinculo === 'auto' ? 'Automático' : l.vinculo === 'manual' ? 'Manual' : '',
      dif: l.diferenca != null && Number(l.diferenca) !== 0 ? Number(l.diferenca) : null,
      site: c ? (ORIGEM_LABEL[c.origem as string] ?? String(c.origem)) : '',
      conta: c ? String(c.conta ?? '') : '',
      cdata: c ? data(c.data as string) : null,
      cdesc: c ? String(c.descricao ?? c.loja ?? '') : '',
      pedido: c
        ? pedidos?.length
          ? pedidos.join(', ')
          : String(c.pedido_externo ?? '').replace(/^pagamento:/, 'pgto ')
        : '',
      ctotal: c ? Number(c.valor_total) : null,
      obs: l.observacao ?? '',
    });
  }
}

export async function planilhaDasFaturas(
  faturas: { fatura: FaturaPlanilha; lancamentos: LancamentoPlanilha[] }[],
  comConciliacao: boolean,
  memoria: MemoriaCartoes | null = null
): Promise<Uint8Array> {
  const ExcelJSMod = (await import('exceljs')).default;
  const wb = new ExcelJSMod.Workbook();
  wb.creator = 'Natuhair Finanças';

  const proximaLinha = new Map<string, number>();
  const ordenadas = [...faturas].sort((a, b) =>
    (a.fatura.vencimento ?? a.fatura.criado_em).localeCompare(b.fatura.vencimento ?? b.fatura.criado_em)
  );
  for (const { fatura, lancamentos } of ordenadas) {
    const empresa = empresaDaFatura(fatura);
    const ws = abaEmpresa(wb, empresa);
    proximaLinha.set(ws.name, escreverBloco(ws, proximaLinha.get(ws.name) ?? 1, empresa, fatura, lancamentos, memoria));
  }
  if (comConciliacao)
    abaConciliacao(
      wb,
      faturas.flatMap((f) => f.lancamentos)
    );

  return new Uint8Array(await wb.xlsx.writeBuffer());
}

export function respostaPlanilha(dados: Uint8Array, arquivo: string): Response {
  return new Response(new Uint8Array(dados), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${arquivo}"`,
      'Cache-Control': 'no-store',
    },
  });
}
