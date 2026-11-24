import ExcelJS from 'exceljs';
import { requireFidcCarteira } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { conferirTitulos, resumir, type Situacao } from '@/lib/fidc/carteira';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const MOEDA = '_-[$R$-416] * #,##0.00_-;-[$R$-416] * #,##0.00_-;_-[$R$-416] * "-"??_-;_-@_-';
const AZUL = 'FF071D7B';
const SITUACAO: Record<Situacao, string> = {
  ok: 'Carteira certa',
  falta: 'Falta trocar',
  outra: 'Outra carteira',
  nao_achado: 'Não achei no ORGM',
};
const COR: Record<Situacao, string> = { ok: 'FFDCFCE7', falta: 'FFFEF3C7', outra: 'FFFFDAD6', nao_achado: 'FFFFDAD6' };
const data = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`) : null);
const solido = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

function cabecalho(ws: ExcelJS.Worksheet) {
  const r = ws.getRow(1);
  r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  r.fill = solido(AZUL);
  r.alignment = { vertical: 'middle' };
  r.height = 20;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
}

/** ?ids=1,2,3 → Excel com o resumo de cada borderô e todos os títulos conferidos no ORGM. */
export async function GET(request: Request) {
  await requireFidcCarteira();
  const ids = (new URL(request.url).searchParams.get('ids') ?? '')
    .split(',')
    .map(Number)
    .filter((n) => n > 0)
    .slice(0, 300);
  if (!ids.length) return new Response('Selecione pelo menos um borderô.', { status: 400 });

  const db = createServiceRoleClient();
  const { data: borderos, error } = await db
    .from('fidc_borderos')
    .select('id,data,fidc,empresa,numero,cedente_cnpj,qtd_titulos,bruto,liquido')
    .in('id', ids)
    .order('data')
    .order('id');
  if (error) return new Response(error.message, { status: 500 });

  const wb = new ExcelJS.Workbook();
  const resumo = wb.addWorksheet('Resumo');
  resumo.columns = [
    { header: 'Data', key: 'data', width: 11, style: { numFmt: 'dd/mm/yyyy' } },
    { header: 'FIDC', key: 'fidc', width: 12 },
    { header: 'Empresa', key: 'empresa', width: 12 },
    { header: 'Borderô', key: 'numero', width: 10 },
    { header: 'Títulos', key: 'total', width: 9 },
    { header: 'Valor', key: 'bruto', width: 16, style: { numFmt: MOEDA } },
    { header: 'Carteira certa', key: 'ok', width: 14 },
    { header: 'Falta trocar', key: 'falta', width: 12 },
    { header: 'Outra carteira', key: 'outra', width: 14 },
    { header: 'Não achados', key: 'naoAchado', width: 12 },
    { header: 'Com aviso', key: 'avisos', width: 11 },
    { header: 'Situação', key: 'situacao', width: 16 },
  ];
  const titulos = wb.addWorksheet('Títulos');
  titulos.columns = [
    { header: 'Data borderô', key: 'data', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
    { header: 'FIDC', key: 'fidc', width: 12 },
    { header: 'Empresa', key: 'empresa', width: 12 },
    { header: 'Borderô', key: 'bordero', width: 10 },
    { header: 'Título (borderô)', key: 'numero', width: 15 },
    { header: 'Doc. ORGM', key: 'documento', width: 12 },
    { header: 'Empresa ORGM', key: 'empresaId', width: 13 },
    { header: 'Sacado', key: 'sacado', width: 34 },
    { header: 'Vencimento', key: 'vencimento', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
    { header: 'Venc. ORGM', key: 'vencimentoOrgm', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
    { header: 'Valor', key: 'valor', width: 15, style: { numFmt: MOEDA } },
    { header: 'Valor ORGM', key: 'valorOrgm', width: 15, style: { numFmt: MOEDA } },
    { header: 'Carteira ORGM', key: 'carteira', width: 34 },
    { header: 'Cód.', key: 'carteiraCod', width: 8 },
    { header: 'Situação', key: 'situacao', width: 17 },
    { header: 'Avisos', key: 'avisos', width: 40 },
  ];

  for (const b of borderos ?? []) {
    const { data: ts } = await db.from('fidc_bordero_titulos').select('ordem,numero,sacado,vencimento,valor').eq('bordero_id', b.id).order('ordem');
    let conferidos;
    try {
      conferidos = await conferirTitulos(
        (ts ?? []).map((t) => ({ ...t, valor: Number(t.valor) })),
        b.fidc,
        b.empresa,
        b.cedente_cnpj ?? ''
      );
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      return new Response(`Não consegui conferir no ORGM: ${m}`, { status: 500 });
    }
    const r = resumir(conferidos);
    const linha = resumo.addRow({
      data: data(b.data),
      fidc: b.fidc,
      empresa: b.empresa,
      numero: b.numero,
      bruto: Number(b.bruto),
      ...r,
      situacao: !r.total ? 'Sem títulos' : r.ok === r.total ? 'Tudo certo' : 'Com pendência',
    });
    linha.getCell('situacao').fill = solido(r.total && r.ok === r.total ? COR.ok : COR.falta);
    for (const t of conferidos) {
      const l = titulos.addRow({
        data: data(b.data),
        fidc: b.fidc,
        empresa: b.empresa,
        bordero: b.numero,
        numero: t.numero,
        documento: t.documento,
        empresaId: t.empresaId,
        sacado: t.sacado,
        vencimento: data(t.vencimento),
        vencimentoOrgm: data(t.vencimentoOrgm),
        valor: t.valor,
        valorOrgm: t.valorOrgm,
        carteira: t.carteira,
        carteiraCod: t.carteiraCod,
        situacao: SITUACAO[t.situacao],
        avisos: t.avisos.join(' '),
      });
      l.getCell('situacao').fill = solido(COR[t.situacao]);
    }
  }
  cabecalho(resumo);
  cabecalho(titulos);

  const hoje = new Date().toLocaleDateString('pt-BR').replace(/\//g, '.');
  const nome = `carteira FIDC ${hoje} (${(borderos ?? []).length} borderô${(borderos ?? []).length === 1 ? '' : 's'}).xlsx`;
  const ascii = nome.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
    },
  });
}
