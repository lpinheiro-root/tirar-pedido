'use server';

import { createHash } from 'crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireRepresentante } from '@/lib/auth';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { extrairLinhasPdf, PdfSenhaError } from '@/lib/cartao/pdf';
import { parseLinhas } from '@/lib/cartao/parser';
import { conciliar, chaveParcela, avaliar } from '@/lib/cartao/conciliacao';
import { lerPlanilhaCompras } from '@/lib/cartao/importacao';
import { buscarCompras, type IntegracaoML } from '@/lib/cartao/mercadolivre';

type Supabase = ReturnType<typeof createClient>;

export interface FormResultado {
  erro?: string;
  precisaSenha?: boolean;
  mensagem?: string;
}

const DIA_MS = 86_400_000;

function somarDias(data: string, dias: number): string {
  return new Date(Date.parse(data) + dias * DIA_MS).toISOString().slice(0, 10);
}

function compraConciliavel(c: Record<string, unknown>) {
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

function lancamentoConciliavel(l: Record<string, unknown>) {
  return {
    id: l.id as string,
    data: l.data as string,
    descricao: l.descricao as string,
    valor: Number(l.valor),
    parcelaAtual: l.parcela_atual as number | null,
    parcelaTotal: l.parcela_total as number | null,
  };
}

/** Concilia automaticamente os lançamentos de compra ainda pendentes de uma fatura. */
async function conciliarFatura(supabase: Supabase, faturaId: string): Promise<number> {
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
  const { data: compras } = await supabase
    .from('cartao_compras')
    .select('*')
    .gte('data', somarDias(datas[0], -Math.ceil(maiorParcela * 31) - 10))
    .lte('data', somarDias(datas[datas.length - 1], 3));
  if (!compras?.length) return 0;

  const { data: jaVinculados } = await supabase
    .from('cartao_lancamentos')
    .select('compra_id, parcela_atual')
    .in('compra_id', compras.map((c) => c.id));
  const usadas = new Set(
    (jaVinculados ?? []).map((v) => chaveParcela(v.compra_id as string, v.parcela_atual as number | null))
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
async function conciliarPendentes(supabase: Supabase): Promise<number> {
  const { data } = await supabase
    .from('cartao_lancamentos')
    .select('fatura_id')
    .eq('tipo', 'compra')
    .eq('status', 'pendente')
    .limit(5000);
  const faturas = Array.from(new Set((data ?? []).map((l) => l.fatura_id as string)));
  let total = 0;
  for (const id of faturas) total += await conciliarFatura(supabase, id);
  return total;
}

function revalidarCartao() {
  revalidatePath('/admin/cartao', 'layout');
}

// ─────────────────────────────────────────────────────────────
// Faturas
// ─────────────────────────────────────────────────────────────

export async function enviarFatura(_prev: FormResultado | undefined, formData: FormData): Promise<FormResultado> {
  const { userId } = await requireRepresentante('admin');
  const arquivo = formData.get('arquivo');
  const senha = String(formData.get('senha') ?? '').trim() || undefined;
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: 'Selecione o PDF da fatura.' };
  if (!arquivo.name.toLowerCase().endsWith('.pdf')) return { erro: 'O arquivo precisa ser PDF.' };

  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const hash = createHash('sha256').update(bytes).digest('hex');
  const supabase = createClient();

  const { data: existente } = await supabase
    .from('cartao_faturas')
    .select('id')
    .eq('arquivo_hash', hash)
    .maybeSingle();
  if (existente) redirect(`/admin/cartao/${existente.id}`);

  let linhas: string[];
  try {
    linhas = await extrairLinhasPdf(bytes, senha);
  } catch (e) {
    if (e instanceof PdfSenhaError) return { erro: e.message, precisaSenha: true };
    return { erro: 'Não foi possível ler o PDF. Verifique se é a fatura original do banco.' };
  }

  const fatura = parseLinhas(linhas);
  if (fatura.lancamentos.length === 0) {
    return {
      erro:
        linhas.length === 0
          ? 'O PDF não tem texto (parece ser imagem escaneada). Baixe a fatura original no app/site do banco.'
          : 'Nenhum lançamento foi reconhecido nesta fatura.',
    };
  }

  const { data: nova, error } = await supabase
    .from('cartao_faturas')
    .insert({
      banco: fatura.banco,
      arquivo_nome: arquivo.name,
      arquivo_hash: hash,
      vencimento: fatura.vencimento,
      total: fatura.total,
      criado_por: userId,
    })
    .select('id')
    .single();
  if (error || !nova) return { erro: `Erro ao salvar a fatura: ${error?.message}` };

  const { error: erroLanc } = await supabase.from('cartao_lancamentos').insert(
    fatura.lancamentos.map((l, i) => ({
      fatura_id: nova.id,
      ordem: i,
      data: l.data,
      descricao: l.descricao,
      valor: l.valor,
      tipo: l.tipo,
      parcela_atual: l.parcelaAtual,
      parcela_total: l.parcelaTotal,
      cartao_final: l.cartaoFinal,
    }))
  );
  if (erroLanc) {
    await supabase.from('cartao_faturas').delete().eq('id', nova.id);
    return { erro: `Erro ao salvar os lançamentos: ${erroLanc.message}` };
  }

  await conciliarFatura(supabase, nova.id);
  revalidarCartao();
  redirect(`/admin/cartao/${nova.id}`);
}

export async function reconciliarFatura(formData: FormData) {
  await requireRepresentante('admin');
  await conciliarFatura(createClient(), String(formData.get('faturaId')));
  revalidarCartao();
}

export async function excluirFatura(formData: FormData) {
  await requireRepresentante('admin');
  await createClient().from('cartao_faturas').delete().eq('id', String(formData.get('faturaId')));
  revalidarCartao();
  redirect('/admin/cartao');
}

// ─────────────────────────────────────────────────────────────
// Lançamentos (ações manuais)
// ─────────────────────────────────────────────────────────────

export async function vincularManual(formData: FormData) {
  await requireRepresentante('admin');
  const lancamentoId = String(formData.get('lancamentoId'));
  const compraId = String(formData.get('compraId') ?? '');
  if (!compraId) return;

  const supabase = createClient();
  const [{ data: lanc }, { data: compra }] = await Promise.all([
    supabase.from('cartao_lancamentos').select('*').eq('id', lancamentoId).single(),
    supabase.from('cartao_compras').select('*').eq('id', compraId).single(),
  ]);
  if (!lanc || !compra) return;

  const c = compraConciliavel(compra);
  const parcelas = c.parcelas > 1 ? c.parcelas : (lanc.parcela_total as number | null) ?? 1;
  const esperado = parcelas > 1 ? c.valorParcela ?? c.valorTotal / parcelas : c.valorTotal;
  const diferenca = Math.round((Number(lanc.valor) - esperado) * 100) / 100;
  const avaliacao = avaliar(lancamentoConciliavel(lanc), c);

  await supabase
    .from('cartao_lancamentos')
    .update({
      compra_id: compraId,
      vinculo: 'manual',
      status: avaliacao?.status === 'conciliado' || Math.abs(diferenca) <= 0.05 ? 'conciliado' : 'divergente',
      diferenca: Math.abs(diferenca) <= 0.05 ? 0 : diferenca,
    })
    .eq('id', lancamentoId);
  revalidarCartao();
}

export async function desvincular(formData: FormData) {
  await requireRepresentante('admin');
  await createClient()
    .from('cartao_lancamentos')
    .update({ status: 'pendente', compra_id: null, vinculo: null, diferenca: null, observacao: null })
    .eq('id', String(formData.get('lancamentoId')));
  revalidarCartao();
}

/** Marca como resolvido sem compra (ex.: assinatura) ou aceita uma divergência. */
export async function marcarResolvido(formData: FormData) {
  await requireRepresentante('admin');
  const supabase = createClient();
  const id = String(formData.get('lancamentoId'));
  const observacao = String(formData.get('observacao') ?? '').trim() || null;
  const { data: lanc } = await supabase.from('cartao_lancamentos').select('compra_id').eq('id', id).single();
  await supabase
    .from('cartao_lancamentos')
    .update({ status: lanc?.compra_id ? 'conciliado' : 'ignorado', vinculo: 'manual', observacao })
    .eq('id', id);
  revalidarCartao();
}

// ─────────────────────────────────────────────────────────────
// Compras
// ─────────────────────────────────────────────────────────────

export async function importarCompras(_prev: FormResultado | undefined, formData: FormData): Promise<FormResultado> {
  await requireRepresentante('admin');
  const arquivo = formData.get('arquivo');
  const origemPadrao = String(formData.get('origem') ?? 'outro');
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: 'Selecione a planilha.' };

  let resultado;
  try {
    resultado = lerPlanilhaCompras(new Uint8Array(await arquivo.arrayBuffer()), origemPadrao);
  } catch {
    return { erro: 'Não foi possível ler a planilha (use .xlsx ou .csv).' };
  }
  if (resultado.compras.length === 0) {
    return { erro: ['Nenhuma compra válida encontrada.', ...resultado.erros.slice(0, 5)].join(' ') };
  }

  const supabase = createClient();
  const comPedido = resultado.compras.filter((c) => c.pedido_externo);
  const semPedido = resultado.compras.filter((c) => !c.pedido_externo);
  if (comPedido.length) {
    const { error } = await supabase
      .from('cartao_compras')
      .upsert(comPedido, { onConflict: 'origem,pedido_externo' });
    if (error) return { erro: error.message };
  }
  if (semPedido.length) {
    const { error } = await supabase.from('cartao_compras').insert(semPedido);
    if (error) return { erro: error.message };
  }

  const conciliados = await conciliarPendentes(supabase);
  revalidarCartao();
  const avisos = resultado.erros.length ? ` ${resultado.erros.length} linha(s) ignorada(s).` : '';
  return {
    mensagem: `${resultado.compras.length} compra(s) importada(s), ${conciliados} lançamento(s) conciliado(s).${avisos}`,
  };
}

export async function novaCompra(_prev: FormResultado | undefined, formData: FormData): Promise<FormResultado> {
  await requireRepresentante('admin');
  const valor = Number(String(formData.get('valor') ?? '').replace(/\./g, '').replace(',', '.'));
  const data = String(formData.get('data') ?? '');
  if (!data || !Number.isFinite(valor) || valor <= 0) return { erro: 'Informe data e valor.' };

  const supabase = createClient();
  const { error } = await supabase.from('cartao_compras').insert({
    origem: String(formData.get('origem') ?? 'outro'),
    pedido_externo: String(formData.get('pedido') ?? '').trim() || null,
    data,
    loja: String(formData.get('loja') ?? '').trim() || null,
    descricao: String(formData.get('descricao') ?? '').trim() || null,
    valor_total: valor,
    parcelas: Math.min(48, Math.max(1, Number(formData.get('parcelas') || 1))),
    fonte: 'manual',
  });
  if (error) {
    return { erro: error.code === '23505' ? 'Já existe uma compra com esse número de pedido.' : error.message };
  }
  const conciliados = await conciliarPendentes(supabase);
  revalidarCartao();
  return { mensagem: `Compra cadastrada. ${conciliados} lançamento(s) conciliado(s).` };
}

export async function excluirCompra(formData: FormData) {
  await requireRepresentante('admin');
  const supabase = createClient();
  const id = String(formData.get('compraId'));
  // lançamentos vinculados voltam para pendente
  await supabase
    .from('cartao_lancamentos')
    .update({ status: 'pendente', compra_id: null, vinculo: null, diferenca: null })
    .eq('compra_id', id);
  await supabase.from('cartao_compras').delete().eq('id', id);
  revalidarCartao();
}

// ─────────────────────────────────────────────────────────────
// Mercado Livre
// ─────────────────────────────────────────────────────────────

export async function sincronizarMercadoLivre(
  _prev: FormResultado | undefined,
  formData: FormData
): Promise<FormResultado> {
  await requireRepresentante('admin');
  const dias = Math.min(730, Math.max(7, Number(formData.get('dias') || 120)));
  const desde = somarDias(new Date().toISOString().slice(0, 10), -dias);

  const service = createServiceRoleClient();
  const { data: contas } = await service
    .from('cartao_integracoes')
    .select('*')
    .eq('provedor', 'mercadolivre');
  if (!contas?.length) return { erro: 'Nenhuma conta do Mercado Livre conectada.' };

  const supabase = createClient();
  let total = 0;
  const falhas: string[] = [];
  for (const conta of contas as IntegracaoML[]) {
    try {
      const compras = (await buscarCompras(conta, desde)).filter((c) => c.valor_total > 0 && c.data);
      if (compras.length) {
        const { error } = await supabase
          .from('cartao_compras')
          .upsert(compras, { onConflict: 'origem,pedido_externo' });
        if (error) throw new Error(error.message);
      }
      await service
        .from('cartao_integracoes')
        .update({ ultima_sincronizacao: new Date().toISOString() })
        .eq('id', conta.id);
      total += compras.length;
    } catch (e) {
      falhas.push(`${conta.apelido}: ${(e as Error).message}`);
    }
  }

  const conciliados = await conciliarPendentes(supabase);
  revalidarCartao();
  const mensagem = `${total} compra(s) sincronizada(s), ${conciliados} lançamento(s) conciliado(s).`;
  return falhas.length ? { erro: `${mensagem} Falhas: ${falhas.join('; ')}` } : { mensagem };
}

export async function desconectarMercadoLivre(formData: FormData) {
  await requireRepresentante('admin');
  await createServiceRoleClient().from('cartao_integracoes').delete().eq('id', String(formData.get('id')));
  revalidarCartao();
}
