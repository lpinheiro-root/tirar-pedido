import { requireRelatorioGerencial } from '@/lib/auth';
import { hojeSP } from '@/lib/gerencial/carregar';
import { gerarExcelGerencial } from '@/lib/gerencial/excel';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Baixa o Relatório Gerencial do ano em Excel, no modelo da planilha do controle (ver lib/gerencial/excel.ts). */
export async function GET(req: Request) {
  await requireRelatorioGerencial();
  const { anoAtual } = hojeSP();
  const pedido = Number(new URL(req.url).searchParams.get('ano'));
  const ano = Number.isInteger(pedido) && pedido >= 2023 && pedido <= anoAtual ? pedido : anoAtual;
  try {
    const { buf, nome } = await gerarExcelGerencial(ano);
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${semAcento(nome)}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
      },
    });
  } catch (e) {
    return new Response(`Não consegui gerar o Excel: ${e instanceof Error ? e.message : String(e)}`, { status: 500 });
  }
}
