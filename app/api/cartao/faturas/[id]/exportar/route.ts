import { notFound } from 'next/navigation';
import { requireCartao } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { BANCO_LABEL, ORIGEM_LABEL, STATUS_LANCAMENTO, TIPO_LABEL, type StatusLancamento } from '@/lib/cartao/rotulos';
import { dataExcel, respostaExcel } from '@/lib/cartao/exportacao';

export const dynamic = 'force-dynamic';

/** Exporta a fatura com o resultado da conciliação de cada lançamento. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  await requireCartao();
  const supabase = createClient();

  const [{ data: fatura }, { data: lancamentos }] = await Promise.all([
    supabase.from('cartao_faturas').select('*').eq('id', params.id).maybeSingle(),
    supabase.from('cartao_lancamentos').select('*, cartao_compras(*)').eq('fatura_id', params.id).order('ordem'),
  ]);
  if (!fatura) notFound();

  const linhas = (lancamentos ?? []).map((l) => {
    const c = l.cartao_compras as Record<string, unknown> | null;
    return {
      Data: dataExcel(l.data),
      Lançamento: l.descricao,
      Parcela: l.parcela_atual ? `${l.parcela_atual}/${l.parcela_total}` : '',
      'Final cartão': l.cartao_final ?? '',
      Tipo: TIPO_LABEL[l.tipo] ?? l.tipo,
      Valor: Number(l.valor),
      Status: l.tipo === 'compra' ? STATUS_LANCAMENTO[l.status as StatusLancamento].label : '',
      Vínculo: l.vinculo === 'auto' ? 'Automático' : l.vinculo === 'manual' ? 'Manual' : '',
      Diferença: l.diferenca != null && Number(l.diferenca) !== 0 ? Number(l.diferenca) : null,
      'Compra - site': c ? ORIGEM_LABEL[c.origem as string] ?? (c.origem as string) : '',
      'Compra - data': c ? dataExcel(c.data as string) : null,
      'Compra - descrição': c ? String(c.descricao ?? c.loja ?? '') : '',
      'Compra - pedido': c ? String(c.pedido_externo ?? '').replace(/^pagamento:/, 'pgto ') : '',
      'Compra - valor total': c ? Number(c.valor_total) : null,
      Observação: l.observacao ?? '',
    };
  });

  const banco = BANCO_LABEL[fatura.banco] ?? fatura.banco;
  const nome = `fatura-${fatura.banco}-${fatura.vencimento ?? fatura.criado_em.slice(0, 10)}.xlsx`;
  return respostaExcel(linhas, `Fatura ${banco}`, nome);
}
