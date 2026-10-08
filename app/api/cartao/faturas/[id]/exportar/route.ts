import { notFound } from 'next/navigation';
import { requireCartao } from '@/lib/auth';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { carregarMemoria } from '@/lib/cartao/classificacoes';
import {
  empresaDaFatura,
  planilhaDasFaturas,
  respostaPlanilha,
  type FaturaPlanilha,
  type LancamentoPlanilha,
} from '@/lib/cartao/planilhaCartoes';

export const dynamic = 'force-dynamic';

/**
 * Exporta a fatura no formato da planilha "Cartões" do financeiro (aba da
 * empresa com o bloco da fatura) e, numa segunda aba, a conciliação detalhada.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  await requireCartao();
  const supabase = createClient();

  const [{ data: fatura }, { data: lancamentos }] = await Promise.all([
    supabase.from('cartao_faturas').select('*').eq('id', params.id).maybeSingle(),
    supabase.from('cartao_lancamentos').select('*, cartao_compras(*)').eq('fatura_id', params.id).order('ordem'),
  ]);
  if (!fatura) notFound();

  const f = fatura as FaturaPlanilha;
  const dados = await planilhaDasFaturas(
    [{ fatura: f, lancamentos: (lancamentos ?? []) as LancamentoPlanilha[] }],
    true,
    await carregarMemoria(createServiceRoleClient())
  );
  const nome = `Fatura cartao ${empresaDaFatura(f)} ${f.vencimento ?? f.criado_em.slice(0, 10)}.xlsx`;
  return respostaPlanilha(dados, nome);
}
