import { requireCartao } from '@/lib/auth';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { carregarMemoria } from '@/lib/cartao/classificacoes';
import { buscarTodas } from '@/lib/supabasePaginado';
import {
  planilhaDasFaturas,
  respostaPlanilha,
  type FaturaPlanilha,
  type LancamentoPlanilha,
} from '@/lib/cartao/planilhaCartoes';

export const dynamic = 'force-dynamic';

/** Todas as faturas que o usuário vê, no formato da planilha "Cartões": uma aba por empresa, um bloco por fatura. */
export async function GET() {
  const { userId } = await requireCartao();
  const supabase = createClient();

  const { data: faturas } = await supabase.from('cartao_faturas').select('*').order('vencimento');
  // o mesmo PDF enviado por duas pessoas entra uma vez só (fica a cópia de quem está baixando)
  const porArquivo = new Map<string, FaturaPlanilha & { arquivo_hash: string; criado_por: string }>();
  for (const f of (faturas ?? []) as (FaturaPlanilha & {
    arquivo_hash: string;
    criado_por: string;
  })[]) {
    const atual = porArquivo.get(f.arquivo_hash);
    if (!atual || (atual.criado_por !== userId && f.criado_por === userId)) porArquivo.set(f.arquivo_hash, f);
  }
  const lista: FaturaPlanilha[] = Array.from(porArquivo.values());
  const lancamentos = lista.length
    ? await buscarTodas<LancamentoPlanilha & { fatura_id: string }>((de, ate) =>
        supabase
          .from('cartao_lancamentos')
          .select('*, cartao_compras(*)')
          .in(
            'fatura_id',
            lista.map((f) => f.id)
          )
          .order('fatura_id')
          .order('ordem')
          .range(de, ate)
      )
    : [];

  const dados = await planilhaDasFaturas(
    lista.map((fatura) => ({
      fatura,
      lancamentos: lancamentos.filter((l) => l.fatura_id === fatura.id),
    })),
    false,
    await carregarMemoria(createServiceRoleClient())
  );
  return respostaPlanilha(dados, `Cartoes ${new Date().toISOString().slice(0, 10)}.xlsx`);
}
