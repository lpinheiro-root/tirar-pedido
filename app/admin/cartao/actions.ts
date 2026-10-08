'use server';

import { createHash } from 'crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireCartao } from '@/lib/auth';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { extrairLinhasPdf, PdfSenhaError } from '@/lib/cartao/pdf';
import { ocrPdf } from '@/lib/cartao/ocr';
import { parseLinhas } from '@/lib/cartao/parser';
import { avaliar } from '@/lib/cartao/conciliacao';
import {
  compraConciliavel,
  conciliarFatura,
  conciliarPendentes,
  lancamentoConciliavel,
  somarDias,
} from '@/lib/cartao/conciliacaoDb';
import { lerPlanilhaCompras } from '@/lib/cartao/importacao';
import { lerPlanilhaCartoes } from '@/lib/cartao/classificacoes';
import { contasML, sincronizarContasML } from '@/lib/cartao/sincronizacaoML';
import { vincularNotas } from '@/lib/cartao/nfe';

export interface FormResultado {
  erro?: string;
  precisaSenha?: boolean;
  mensagem?: string;
}

function revalidarCartao() {
  revalidatePath('/admin/cartao', 'layout');
}

// ─────────────────────────────────────────────────────────────
// Faturas
// ─────────────────────────────────────────────────────────────

type ResultadoFatura = { id: string; nova: boolean } | { erro: string; precisaSenha?: boolean };

/** Lê um PDF de fatura, grava a fatura e os lançamentos e concilia. */
async function processarFatura(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  arquivo: File,
  senha: string | undefined
): Promise<ResultadoFatura> {
  if (!arquivo.name.toLowerCase().endsWith('.pdf')) return { erro: 'O arquivo precisa ser PDF.' };

  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const hash = createHash('sha256').update(bytes).digest('hex');

  const { data: existente } = await supabase
    .from('cartao_faturas')
    .select('id')
    .eq('arquivo_hash', hash)
    .eq('criado_por', userId)
    .maybeSingle();
  if (existente) return { id: existente.id, nova: false };

  let linhas: string[];
  try {
    // cópia: o pdf.js transfere (esvazia) o buffer que recebe, e o OCR ainda precisa dele
    linhas = await extrairLinhasPdf(bytes.slice(), senha);
  } catch (e) {
    if (e instanceof PdfSenhaError) return { erro: e.message, precisaSenha: true };
    return { erro: 'Não foi possível ler o PDF. Verifique se é a fatura original do banco.' };
  }

  // PDF sem texto (fatura salva como imagem): lê pelo OCR
  const porImagem = linhas.length === 0;
  if (porImagem) {
    try {
      linhas = await ocrPdf(bytes);
    } catch (e) {
      console.error('[cartao/ocr]', e);
      linhas = [];
    }
  }

  const fatura = parseLinhas(linhas);
  if (fatura.lancamentos.length === 0) {
    return {
      erro: porImagem
        ? 'O PDF é uma imagem e a leitura automática não achou lançamentos. Baixe a fatura original no app/site do banco.'
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
  return { id: nova.id, nova: true };
}

/**
 * Envia uma ou várias faturas (uma por empresa/cartão). Com uma só, abre a
 * fatura; com várias, fica na lista e mostra o resultado de cada arquivo.
 */
export async function enviarFatura(_prev: FormResultado | undefined, formData: FormData): Promise<FormResultado> {
  const { userId } = await requireCartao();
  const arquivos = formData.getAll('arquivo').filter((f): f is File => f instanceof File && f.size > 0);
  const senha = String(formData.get('senha') ?? '').trim() || undefined;
  if (!arquivos.length) return { erro: 'Selecione o PDF da fatura.' };

  const supabase = createClient();
  if (arquivos.length === 1) {
    const r = await processarFatura(supabase, userId, arquivos[0], senha);
    if ('erro' in r) return { erro: r.erro, precisaSenha: r.precisaSenha };
    revalidarCartao();
    redirect(r.nova ? `/admin/cartao/${r.id}?nova=1` : `/admin/cartao/${r.id}`);
  }

  const ok: string[] = [];
  const falhas: string[] = [];
  let precisaSenha = false;
  for (const arquivo of arquivos) {
    const r = await processarFatura(supabase, userId, arquivo, senha);
    if ('erro' in r) {
      falhas.push(`${arquivo.name}: ${r.erro}`);
      precisaSenha ||= Boolean(r.precisaSenha);
    } else {
      ok.push(r.nova ? arquivo.name : `${arquivo.name} (já tinha sido enviada)`);
    }
  }
  revalidarCartao();
  return {
    mensagem: ok.length ? `${ok.length} fatura(s) importada(s) e conciliada(s): ${ok.join(', ')}.` : undefined,
    erro: falhas.length ? `Não importadas: ${falhas.join(' | ')}` : undefined,
    precisaSenha,
  };
}

export async function reconciliarFatura(formData: FormData) {
  await requireCartao();
  await conciliarFatura(createClient(), String(formData.get('faturaId')));
  revalidarCartao();
}

export async function excluirFatura(formData: FormData) {
  await requireCartao();
  await createClient().from('cartao_faturas').delete().eq('id', String(formData.get('faturaId')));
  revalidarCartao();
  redirect('/admin/cartao');
}

// ─────────────────────────────────────────────────────────────
// Lançamentos (ações manuais)
// ─────────────────────────────────────────────────────────────

export async function vincularManual(formData: FormData) {
  await requireCartao();
  const lancamentoId = String(formData.get('lancamentoId'));
  const compraId = String(formData.get('compraId') ?? '');
  if (!compraId) return;

  const supabase = createClient();
  const [{ data: lanc }, { data: compra }] = await Promise.all([
    supabase.from('cartao_lancamentos').select('*, cartao_faturas(criado_por)').eq('id', lancamentoId).single(),
    supabase.from('cartao_compras').select('*').eq('id', compraId).single(),
  ]);
  if (!lanc || !compra) return;
  const dono = (lanc.cartao_faturas as { criado_por: string } | null)?.criado_por;
  if (compra.usuario_id !== dono) return;

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
  await requireCartao();
  await createClient()
    .from('cartao_lancamentos')
    .update({ status: 'pendente', compra_id: null, vinculo: null, diferenca: null, observacao: null })
    .eq('id', String(formData.get('lancamentoId')));
  revalidarCartao();
}

/** Marca como resolvido sem compra (ex.: assinatura) ou aceita uma divergência. */
export async function marcarResolvido(formData: FormData) {
  await requireCartao();
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
  const { userId } = await requireCartao();
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
  const compras = resultado.compras.map((c) => ({ ...c, usuario_id: userId }));
  const comPedido = compras.filter((c) => c.pedido_externo);
  const semPedido = compras.filter((c) => !c.pedido_externo);
  if (comPedido.length) {
    const { error } = await supabase
      .from('cartao_compras')
      .upsert(comPedido, { onConflict: 'usuario_id,origem,pedido_externo' });
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
  const { userId } = await requireCartao();
  const valor = Number(String(formData.get('valor') ?? '').replace(/\./g, '').replace(',', '.'));
  const data = String(formData.get('data') ?? '');
  if (!data || !Number.isFinite(valor) || valor <= 0) return { erro: 'Informe data e valor.' };

  const supabase = createClient();
  const { error } = await supabase.from('cartao_compras').insert({
    usuario_id: userId,
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
  await requireCartao();
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
  const { userId, representante } = await requireCartao();
  const dias = Math.min(730, Math.max(7, Number(formData.get('dias') || 120)));
  const desde = somarDias(new Date().toISOString().slice(0, 10), -dias);

  // tokens só no servidor: a tabela não tem policies, então o filtro de dono é aqui
  const contas = await contasML(representante.super_admin ? undefined : userId);
  if (!contas.length) return { erro: 'Nenhuma conta do Mercado Livre conectada.' };

  const { total, falhas } = await sincronizarContasML(contas, desde);
  const conciliados = await conciliarPendentes(createClient());
  const notas = await vincularNotas(createServiceRoleClient());
  revalidarCartao();
  const mensagem =
    `${total} compra(s) sincronizada(s), ${conciliados} lançamento(s) conciliado(s)` +
    (notas ? `, ${notas} nota(s) fiscal(is) vinculada(s).` : '.');
  return falhas.length ? { erro: `${mensagem} Falhas: ${falhas.join('; ')}` } : { mensagem };
}

export async function desconectarMercadoLivre(formData: FormData) {
  const { userId, representante } = await requireCartao();
  let exclusao = createServiceRoleClient().from('cartao_integracoes').delete().eq('id', String(formData.get('id')));
  if (!representante.super_admin) exclusao = exclusao.eq('usuario_id', userId);
  await exclusao;
  revalidarCartao();
}

// ─────────────────────────────────────────────────────────────
// Planilha "Cartões" do financeiro (memória para o Excel exportado)
// ─────────────────────────────────────────────────────────────

/**
 * Importa a planilha "Cartões" (ou um Excel exportado e preenchido pela equipe):
 * cada fatura da planilha (empresa + vencimento) substitui o que havia antes.
 */
export async function importarPlanilhaCartoes(
  _prev: FormResultado | undefined,
  formData: FormData
): Promise<FormResultado> {
  const { userId } = await requireCartao();
  const arquivo = formData.get('arquivo');
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: 'Selecione a planilha Cartões (.xlsx).' };

  let lido;
  try {
    lido = await lerPlanilhaCartoes(await arquivo.arrayBuffer());
  } catch {
    return {
      erro: 'Não consegui ler o arquivo. Use a planilha Cartões em .xlsx.',
    };
  }
  if (!lido.linhas.length) {
    return {
      erro: 'Nenhuma fatura encontrada. As abas precisam se chamar "Cartão <empresa>" e ter os blocos "Fatura-cartão EMPRESA dd/mm/aaaa".',
    };
  }

  const service = createServiceRoleClient();
  const faturas = new Map<string, { empresa: string; vencimento: string | null }>();
  lido.linhas.forEach((l) =>
    faturas.set(`${l.empresa}|${l.vencimento}`, {
      empresa: l.empresa,
      vencimento: l.vencimento,
    })
  );
  for (const { empresa, vencimento } of Array.from(faturas.values())) {
    let apagar = service.from('cartao_classificacoes').delete().eq('empresa', empresa);
    apagar = vencimento ? apagar.eq('vencimento', vencimento) : apagar.is('vencimento', null);
    const { error } = await apagar;
    if (error) {
      return {
        erro: /cartao_classificacoes/.test(error.message)
          ? 'Falta rodar o supabase/cartao_classificacoes.sql no Supabase.'
          : `Erro ao gravar: ${error.message}`,
      };
    }
  }
  const linhas = lido.linhas.map((l) => ({ ...l, importado_por: userId }));
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await service.from('cartao_classificacoes').insert(linhas.slice(i, i + 500));
    if (error) return { erro: `Erro ao gravar: ${error.message}` };
  }

  const empresas = Array.from(new Set(lido.linhas.map((l) => l.empresa))).join(', ');
  revalidarCartao();
  return {
    mensagem: `${lido.linhas.length} lançamentos de ${faturas.size} fatura(s) importados (${empresas}). O Excel das próximas faturas já sai preenchido com essas informações.`,
  };
}
