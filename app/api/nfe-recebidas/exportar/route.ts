import ExcelJS from 'exceljs';
import { type NextRequest } from 'next/server';
import { requireDevolucoes } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { buscarDevolucoes, lerFiltros, type Devolucao } from '@/lib/nfeRecebidas';
import { nomeEmpresaPlanilha, numeroDaChave } from '@/lib/devolucoes';

export const dynamic = 'force-dynamic';

// layout da planilha "STATUS DE DEVOLUÇÃO 2026": mesmas colunas, larguras e estilos
const COLUNAS: { titulo: string; largura: number }[] = [
  { titulo: 'Empresa', largura: 15.7 },
  { titulo: 'Emissão', largura: 12.1 },
  { titulo: 'Cliente', largura: 30 },
  { titulo: 'Nota de Origem', largura: 18.6 },
  { titulo: 'NFD', largura: 10 },
  { titulo: 'Valor R$', largura: 14 },
  { titulo: 'Motivo', largura: 26.4 },
  { titulo: 'Mercadoria vai voltar p/ fabrica?', largura: 32.7 },
  { titulo: 'Dia do retorno da mercadoia/ retornou para estoque ?', largura: 54 },
  { titulo: 'Transportadora', largura: 15.1 },
  { titulo: 'Transportadora será debitada? ', largura: 31 },
  { titulo: 'pagamento ao Cliente?', largura: 29.7 },
  { titulo: 'Foi feito pagamento?', largura: 41 },
  { titulo: 'Estado', largura: 8 },
  { titulo: 'Status ', largura: 87.7 },
  { titulo: 'NF FISCAL ', largura: 71.7 },
];

const FONTE: Partial<ExcelJS.Font> = { name: 'Century Gothic', size: 10 };
const BORDA: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};
const MOEDA = '_-"R$" * #,##0.00_-;-"R$" * #,##0.00_-;_-"R$" * "-"??_-;_-@_-';
const VERDE = 'FF92D050';

function mesAno(d: Devolucao): string {
  const data = new Date(d.data_emissao ?? Date.now());
  const [dia, mes, ano] = data.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }).split('/');
  void dia;
  return `${mes}-${ano}`;
}

/** Excel das devoluções no modelo da planilha de ocorrências, uma aba por mês. */
export async function GET(request: NextRequest) {
  await requireDevolucoes();
  const supabase = createClient();
  const filtros = lerFiltros(Object.fromEntries(request.nextUrl.searchParams));
  const [devolucoes, todas] = await Promise.all([
    buscarDevolucoes(supabase, filtros),
    buscarDevolucoes(supabase, { empresa: '', mes: '', busca: '', situacao: '' }),
  ]);
  const unidades = Array.from(
    new Map(todas.filter((d) => d.cnpj_destinatario).map((d) => [d.cnpj_destinatario!, { cnpj: d.cnpj_destinatario!, uf: d.empresa_uf }])).values()
  );

  // abas em ordem cronológica (01-2026, 02-2026...), linhas por data de emissão
  const porMes = new Map<string, Devolucao[]>();
  for (const d of [...devolucoes].sort((a, b) => (a.data_emissao ?? '').localeCompare(b.data_emissao ?? ''))) {
    const chave = mesAno(d);
    porMes.set(chave, [...(porMes.get(chave) ?? []), d]);
  }
  const meses = Array.from(porMes.keys()).sort((a, b) => a.split('-').reverse().join().localeCompare(b.split('-').reverse().join()));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Natuhair Finanças';
  for (const mes of meses.length ? meses : [mesAno({ data_emissao: new Date().toISOString() } as Devolucao)]) {
    const ws = wb.addWorksheet(mes);
    ws.columns = COLUNAS.map((c) => ({ width: c.largura }));

    // linha 1: título mesclado
    ws.mergeCells(1, 1, 1, COLUNAS.length);
    const titulo = ws.getCell(1, 1);
    titulo.value = `OCORRÊNCIA DE DEVOLUÇÃO ${mes.split('-')[1]}`;
    titulo.font = { ...FONTE, bold: true };
    titulo.alignment = { horizontal: 'center' };
    titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF808080' } };

    // linha 2: cabeçalho
    const cab = ws.getRow(2);
    COLUNAS.forEach((c, i) => {
      const cel = cab.getCell(i + 1);
      cel.value = c.titulo;
      cel.font = { ...FONTE, bold: true };
      cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
      cel.border = BORDA;
      cel.alignment = { vertical: 'middle', wrapText: true };
    });

    // dados
    for (const d of porMes.get(mes) ?? []) {
      const a = d.devolucoes_acompanhamento;
      const origens = (d.notas_origem ?? []).map(numeroDaChave);
      const linha = ws.addRow([
        nomeEmpresaPlanilha(d.cnpj_destinatario, d.nome_destinatario, d.empresa_uf, unidades),
        d.data_emissao ? new Date(new Date(d.data_emissao).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })) : null,
        d.cliente_nome ?? '',
        origens.length === 1 ? Number(origens[0]) : origens.join(', '),
        Number(numeroDaChave(d.chave)),
        d.valor_total != null ? Number(d.valor_total) : null,
        a?.motivo ?? '',
        a?.volta_fabrica ?? '',
        a?.retorno ?? '',
        a?.transportadora ?? d.transportadora ?? '',
        a?.transportadora_debitada ?? '',
        a?.pagamento_cliente ?? '',
        a?.pagamento_feito ?? '',
        d.cliente_uf ?? '',
        a?.status ?? '',
        a?.nf_fiscal ?? '',
      ]);
      linha.eachCell({ includeEmpty: true }, (cel, n) => {
        cel.font = FONTE;
        cel.border = BORDA;
        cel.alignment = { vertical: 'top', wrapText: n >= 7 };
        if ((n === 15 || n === 16) && cel.value) {
          cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
        }
      });
      linha.getCell(2).numFmt = 'dd/mm/yyyy';
      linha.getCell(6).numFmt = MOEDA;
    }
    ws.views = [{ state: 'frozen', ySplit: 2 }];
  }

  const buffer = await wb.xlsx.writeBuffer();
  const nome = `STATUS DE DEVOLUCAO ${filtros.mes || new Date().getFullYear()}.xlsx`;
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nome}"`,
      'Cache-Control': 'no-store',
    },
  });
}
