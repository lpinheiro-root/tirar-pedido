'use server';

import { revalidatePath } from 'next/cache';
import { requireRelatorioGerencial } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { buscarPagamentosConta } from '@/lib/gerencial/dados';
import { NOME_RUBRICA, type Pagamento } from '@/lib/gerencial/rubricas';

type Resultado = { erro?: string };

const CAMPOS_MENSAL = ['faturamento', 'fat_off', 'fat_terceiros', 'fat_ecommerce', 'fat_exportacao', 'recebimento', 'cheque_especial'] as const;

function revalidar() {
  revalidatePath('/admin/relatorio-gerencial');
}

function erroTabela(msg: string): string {
  return /gerencial_/.test(msg) ? 'Falta rodar o supabase/gerencial.sql no Supabase.' : msg;
}

const anoValido = (a: number) => Number.isInteger(a) && a >= 2020 && a <= 2100;
const mesValido = (m: number) => Number.isInteger(m) && m >= 1 && m <= 12;

/** Faturamento, recebimento e cheque especial de um mês. */
export async function salvarMensal(ano: number, mes: number, valores: Record<string, number>): Promise<Resultado> {
  const { representante } = await requireRelatorioGerencial();
  if (!anoValido(ano) || !mesValido(mes)) return { erro: 'Mês inválido.' };
  const linha: Record<string, unknown> = { ano, mes, atualizado_por: representante.nome, atualizado_em: new Date().toISOString() };
  for (const c of CAMPOS_MENSAL) {
    const v = Number(valores[c] ?? 0);
    if (!Number.isFinite(v)) return { erro: 'Valor inválido.' };
    linha[c] = Math.round(v * 100) / 100;
  }
  const { error } = await createServiceRoleClient().from('gerencial_mensal').upsert(linha, { onConflict: 'ano,mes' });
  if (error) return { erro: erroTabela(error.message) };
  revalidar();
  return {};
}

/** Acerto à mão: tira de uma rubrica e/ou põe em outra. */
export async function criarAjuste(dados: {
  ano: number;
  mes: number;
  de: string | null;
  para: string | null;
  valor: number;
  descricao: string;
}): Promise<Resultado> {
  const { representante } = await requireRelatorioGerencial();
  const de = dados.de || null;
  const para = dados.para || null;
  if (!anoValido(dados.ano) || !mesValido(dados.mes)) return { erro: 'Mês inválido.' };
  if (!de && !para) return { erro: 'Escolha de qual rubrica sai e/ou para qual entra.' };
  if (de === para) return { erro: 'As rubricas de saída e entrada são a mesma.' };
  if ((de && !NOME_RUBRICA.has(de)) || (para && !NOME_RUBRICA.has(para))) return { erro: 'Rubrica inválida.' };
  const valor = Math.round(Number(dados.valor) * 100) / 100;
  if (!Number.isFinite(valor) || valor === 0) return { erro: 'Informe o valor.' };
  if (!dados.descricao.trim()) return { erro: 'Escreva o motivo do ajuste.' };
  const { error } = await createServiceRoleClient()
    .from('gerencial_ajustes')
    .insert({ ano: dados.ano, mes: dados.mes, de_rubrica: de, para_rubrica: para, valor, descricao: dados.descricao.trim().slice(0, 500), criado_por: representante.nome });
  if (error) return { erro: erroTabela(error.message) };
  revalidar();
  return {};
}

export async function excluirAjuste(id: number): Promise<Resultado> {
  await requireRelatorioGerencial();
  const { error } = await createServiceRoleClient().from('gerencial_ajustes').delete().eq('id', id);
  if (error) return { erro: erroTabela(error.message) };
  revalidar();
  return {};
}

/** Em qual rubrica entra uma conta contábil (vazio = volta ao padrão do sistema). */
export async function definirRubrica(conta: string, rubrica: string): Promise<Resultado> {
  const { representante } = await requireRelatorioGerencial();
  const db = createServiceRoleClient();
  if (!conta || conta.length > 40) return { erro: 'Conta inválida.' };
  const { error } = rubrica
    ? NOME_RUBRICA.has(rubrica)
      ? await db.from('gerencial_depara').upsert({ conta, rubrica, alterado_por: representante.nome, alterado_em: new Date().toISOString() })
      : { error: { message: 'Rubrica inválida.' } }
    : await db.from('gerencial_depara').delete().eq('conta', conta);
  if (error) return { erro: erroTabela(error.message) };
  revalidar();
  return {};
}

/** Parâmetro (% sobre o faturamento) de uma rubrica; null volta ao padrão. */
export async function salvarParametro(rubrica: string, percentual: number | null): Promise<Resultado> {
  const { representante } = await requireRelatorioGerencial();
  if (!NOME_RUBRICA.has(rubrica)) return { erro: 'Rubrica inválida.' };
  const db = createServiceRoleClient();
  const { error } =
    percentual === null
      ? await db.from('gerencial_parametros').delete().eq('rubrica', rubrica)
      : !Number.isFinite(percentual) || percentual < 0 || percentual > 1
        ? { error: { message: 'Percentual inválido.' } }
        : await db
            .from('gerencial_parametros')
            .upsert({ rubrica, percentual, alterado_por: representante.nome, alterado_em: new Date().toISOString() });
  if (error) return { erro: erroTabela(error.message) };
  revalidar();
  return {};
}

/** Pagamentos que formam o valor de uma conta num mês. */
export async function detalheConta(ano: number, mes: number, conta: string): Promise<{ erro?: string; linhas?: Pagamento[] }> {
  await requireRelatorioGerencial();
  if (!anoValido(ano) || !mesValido(mes)) return { erro: 'Mês inválido.' };
  try {
    return { linhas: await buscarPagamentosConta(ano, mes, conta) };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e) };
  }
}
