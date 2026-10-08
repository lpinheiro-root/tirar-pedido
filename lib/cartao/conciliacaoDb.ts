import type { SupabaseClient } from '@supabase/supabase-js';
import { conciliar, chaveParcela } from './conciliacao';
import { buscarTodas } from '@/lib/supabasePaginado';

/** Aceita o client do usuário (RLS) ou o service role (rotina agendada). */
export type Supabase = SupabaseClient;


const DIA_MS = 86_400_000;

export function somarDias(data: string, dias: number): string {
  return new Date(Date.parse(data) + dias * DIA_MS).toISOString().slice(0, 10);
}

export function compraConciliavel(c: Record<string, unknown>) {
  return {
    id: c.id as string,
    origem: c.origem as string,
    loja: c.loja as string | null,
    descricao: c.descricao as string | null,
    data: c.data as string,
    valorTotal: Number(c.valor_total),
    parcelas: Number(c.parcelas),
    valorParcela: c.valor_parcela == null ? null : Number(c.valor_parcela),
  };
}

export function lancamentoConciliavel(l: Record<string, unknown>) {
  return {
    id: l.id as string,
    data: l.data as string,
    descricao: l.descricao as string,
    valor: Number(l.valor),
    parcelaAtual: l.parcela_atual as number | null,
    parcelaTotal: l.parcela_total as number | null,
  };
}

/**
 * De quem são as compras que podem casar com a fatura: as do próprio usuário
 * que enviou. Fatura enviada pelo super admin (cartões da empresa) casa com as
 * compras de todas as contas conectadas — devolve null (sem filtro).
 */
export async function donoDasCompras(supabase: Supabase, criadoPor: string): Promise<string | null> {
  const { data } = await supabase.from('representantes').select('super_admin').eq('id', criadoPor).maybeSingle();
  return data?.super_admin ? null : criadoPor;
}

/**
 * Concilia automaticamente os lançamentos de compra ainda pendentes de uma fatura
 * contra as compras de quem a enviou (ou de todos, se foi o super admin).
 */
export async function conciliarFatura(supabase: Supabase, faturaId: string): Promise<number> {
  const { data: fatura } = await supabase
    .from('cartao_faturas')
    .select('criado_por, arquivo_hash')
    .eq('id', faturaId)
    .maybeSingle();
  if (!fatura?.criado_por) return 0;

  const { data: pendentes } = await supabase
    .from('cartao_lancamentos')
    .select('*')
    .eq('fatura_id', faturaId)
    .eq('tipo', 'compra')
    .eq('status', 'pendente');
  if (!pendentes?.length) return 0;

  const lancamentos = pendentes.map(lancamentoConciliavel);
  const datas = lancamentos.map((l) => l.data).sort();
  const maiorParcela = Math.max(1, ...lancamentos.map((l) => l.parcelaAtual ?? 1));
  const dono = await donoDasCompras(supabase, fatura.criado_por);
  let consulta = supabase
    .from('cartao_compras')
    .select('*')
    .gte('data', somarDias(datas[0], -Math.ceil(maiorParcela * 31) - 10))
    .lte('data', somarDias(datas[datas.length - 1], 3));
  if (dono) consulta = consulta.eq('usuario_id', dono);
  const { data: compras } = await consulta;
  if (!compras?.length) return 0;

  // parcela já usada em outra fatura não casa de novo — exceto em cópias do mesmo PDF
  // (a mesma fatura enviada por duas pessoas, ex.: o usuário e o super admin)
  const { data: jaVinculados } = await supabase
    .from('cartao_lancamentos')
    .select('compra_id, parcela_atual, cartao_faturas!inner(arquivo_hash)')
    .in('compra_id', compras.map((c) => c.id));
  const usadas = new Set(
    (jaVinculados ?? [])
      .filter((v) => {
        const f = v.cartao_faturas as unknown as { arquivo_hash: string } | { arquivo_hash: string }[] | null;
        const hash = Array.isArray(f) ? f[0]?.arquivo_hash : f?.arquivo_hash;
        return hash !== fatura.arquivo_hash;
      })
      .map((v) => chaveParcela(v.compra_id as string, v.parcela_atual as number | null))
  );

  const vinculos = conciliar(lancamentos, compras.map(compraConciliavel), usadas);
  for (const v of vinculos) {
    await supabase
      .from('cartao_lancamentos')
      .update({ status: v.status, compra_id: v.compraId, vinculo: 'auto', diferenca: v.diferenca })
      .eq('id', v.lancamentoId)
      .eq('status', 'pendente');
  }
  return vinculos.length;
}

/** Depois de novas compras entrarem, tenta conciliar as faturas com pendências. */
export async function conciliarPendentes(supabase: Supabase): Promise<number> {
  const data = await buscarTodas<{ fatura_id: string }>((de, ate) =>
    supabase
      .from('cartao_lancamentos')
      .select('fatura_id')
      .eq('tipo', 'compra')
      .eq('status', 'pendente')
      .order('id')
      .range(de, ate)
  );
  const faturas = Array.from(new Set(data.map((l) => l.fatura_id)));
  let total = 0;
  for (const id of faturas) total += await conciliarFatura(supabase, id);
  return total;
}
