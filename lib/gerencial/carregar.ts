import { createServiceRoleClient } from '@/lib/supabase/server';
import { buscarContasAno } from './dados';
import type { DadosGerencial } from './calculo';
import type { Ajuste, LancamentoRubrica, Mensal } from './rubricas';

const num = (v: unknown) => Number(v) || 0;

export function hojeSP() {
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  return { hoje, anoAtual: Number(hoje.slice(0, 4)), mesAtual: Number(hoje.slice(5, 7)) };
}

/** Meses fechados: no ano corrente, até o mês anterior ao de hoje. */
export function ultimoMesFechado(ano: number) {
  const { anoAtual, mesAtual } = hojeSP();
  return ano < anoAtual ? 12 : mesAtual - 1;
}

/** O que o controle digitou no sistema (Supabase) para um ano. */
export async function carregarManuais(ano: number) {
  const db = createServiceRoleClient();
  const [mensalR, ajustesR, deparaR, paramR, lancR] = await Promise.all([
    db.from('gerencial_mensal').select('*').eq('ano', ano),
    db.from('gerencial_ajustes').select('*').eq('ano', ano).order('mes').order('id'),
    db.from('gerencial_depara').select('conta,rubrica'),
    db.from('gerencial_parametros').select('rubrica,percentual'),
    db.from('gerencial_lancamentos').select('fin_mov_id,conta,ano,mes,valor,rubrica').eq('ano', ano),
  ]);
  const erroDb = mensalR.error ?? ajustesR.error ?? deparaR.error ?? paramR.error ?? lancR.error;
  const falta = erroDb ? (/gerencial_/.test(erroDb.message) ? 'Falta rodar o supabase/gerencial.sql no Supabase.' : erroDb.message) : null;

  const mensal: Mensal[] = (mensalR.data ?? []).map((m) => ({
    ano: m.ano,
    mes: m.mes,
    faturamento: num(m.faturamento),
    fat_off: num(m.fat_off),
    fat_terceiros: num(m.fat_terceiros),
    fat_ecommerce: num(m.fat_ecommerce),
    fat_exportacao: num(m.fat_exportacao),
    recebimento: num(m.recebimento),
    cheque_especial: num(m.cheque_especial),
  }));
  const ajustes: Ajuste[] = (ajustesR.data ?? []).map((a) => ({ ...a, valor: num(a.valor) }));
  const depara: Record<string, string> = Object.fromEntries((deparaR.data ?? []).map((d) => [d.conta, d.rubrica]));
  const parametros: Record<string, number> = Object.fromEntries((paramR.data ?? []).map((p) => [p.rubrica, num(p.percentual)]));
  const lancamentos: LancamentoRubrica[] = (lancR.data ?? []).map((l) => ({ ...l, fin_mov_id: Number(l.fin_mov_id), valor: num(l.valor) }));
  return { mensal, ajustes, depara, parametros, lancamentos, falta };
}

/** Tudo de um ano (ORGM + Supabase), pronto para calcular(). */
export async function carregarAno(ano: number): Promise<DadosGerencial & { falta: string | null }> {
  const [contas, manuais] = await Promise.all([buscarContasAno(ano), carregarManuais(ano)]);
  return { contas, ...manuais, ultimoMesFechado: ultimoMesFechado(ano) };
}
