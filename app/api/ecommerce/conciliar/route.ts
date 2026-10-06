import { NextResponse } from 'next/server';
import { requireEcommerce } from '@/lib/auth';
import { lerExtratoPdf } from '@/lib/ecommerce/extratoBanco';
import { lerPlanilhaRecebimentos } from '@/lib/ecommerce/planilhaRecebimentos';
import { conciliar } from '@/lib/ecommerce/conciliar';
import { gerarRelatorioConciliacao } from '@/lib/ecommerce/relatorioPdf';
import { preencherFluxo } from '@/lib/ecommerce/fluxoXlsx';
import type { ExtratoLido } from '@/lib/ecommerce/tipos';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const erro = (mensagem: string) => NextResponse.json({ erro: mensagem }, { status: 400 });
const base64 = (dados: Uint8Array) => Buffer.from(dados).toString('base64');

/**
 * Recebe os extratos (PDF), a planilha de recebimentos do e-commerce e,
 * opcionalmente, o Fluxo Financeiro; devolve a conciliação, o relatório em PDF
 * e o Fluxo com a coluna "Creditos Ecommerce" preenchida. Nada é gravado no banco.
 */
export async function POST(request: Request) {
  await requireEcommerce();
  const form = await request.formData();

  const mes = String(form.get('mes') ?? '');
  if (!/^\d{4}-\d{2}$/.test(mes)) return erro('Escolha o mês da conciliação.');
  const pdfs = form.getAll('extratos').filter((f): f is File => f instanceof File && f.size > 0);
  const planilha = form.get('planilha');
  const fluxo = form.get('fluxo');
  if (!pdfs.length) return erro('Selecione os extratos do banco em PDF.');
  if (!(planilha instanceof File) || !planilha.size) return erro('Selecione a planilha de recebimentos do e-commerce.');

  try {
    let id = 0;
    const extratos: ExtratoLido[] = [];
    for (const pdf of pdfs) {
      extratos.push(await lerExtratoPdf(pdf.name, new Uint8Array(await pdf.arrayBuffer()), () => ++id));
    }
    const lida = await lerPlanilhaRecebimentos(planilha.name, await planilha.arrayBuffer(), Number(mes.slice(0, 4)));
    if (!lida.itens.length) return erro('Não achei nenhum recebimento na planilha. Confira se é a planilha de recebimentos do e-commerce.');

    const resultado = conciliar(mes, extratos, lida);
    const relatorio = await gerarRelatorioConciliacao(resultado);

    let fluxoPreenchido = null;
    if (fluxo instanceof File && fluxo.size) {
      const f = await preencherFluxo(await fluxo.arrayBuffer(), resultado.porDia, resultado.inicio, resultado.fim);
      fluxoPreenchido = {
        nome: fluxo.name.replace(/\.xlsx$/i, '') + ' - CREDITOS ECOMMERCE.xlsx',
        base64: base64(f.arquivo),
        aba: f.aba,
        coluna: f.coluna,
        gravados: f.gravados,
      };
    }

    return NextResponse.json({
      resultado,
      relatorio: { nome: `Conciliacao E-Commerce ${mes}.pdf`, base64: base64(relatorio) },
      fluxo: fluxoPreenchido,
    });
  } catch (e) {
    console.error('[ecommerce/conciliar]', e);
    return erro(e instanceof Error ? e.message : 'Não consegui ler os arquivos.');
  }
}
