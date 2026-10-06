/** Tipos da conciliação do e-commerce (extratos bancários × repasses dos marketplaces). */

export interface LancamentoBanco {
  id: number;
  arquivo: string;
  empresa: string;
  conta: string;
  data: string; // AAAA-MM-DD
  historico: string;
  /** CPF/CNPJ de quem pagou, quando o histórico traz (Pix/Ted) */
  documento: string | null;
  valor: number;
  saldo: number;
}

export interface ExtratoLido {
  arquivo: string;
  banco: string;
  empresa: string;
  agencia: string;
  conta: string;
  periodo: string;
  lancamentos: LancamentoBanco[];
}

export interface ItemPlanilha {
  id: number;
  canal: string;
  valor: number;
  /** data informada pelo marketplace (AAAA-MM-DD), quando a aba traz */
  data: string | null;
  referencia: string;
}

export interface PlanilhaLida {
  arquivo: string;
  itens: ItemPlanilha[];
  /** "TOTAL DE ENTRADAS" da aba CONSOLIDADO, quando existe */
  totalConsolidado: number | null;
  avisos: string[];
}

export interface Conciliado {
  item: ItemPlanilha;
  banco: LancamentoBanco | null;
  /** dia em que entra no fluxo (data do banco; o dia 1º do mês seguinte vai para o último dia útil) */
  diaFluxo: string | null;
  sugestoes: { banco: LancamentoBanco; diferenca: number }[];
}

export interface ResultadoConciliacao {
  mes: string; // AAAA-MM
  inicio: string;
  fim: string; // dia 1º do mês seguinte (incluído)
  extratos: { arquivo: string; banco: string; empresa: string; conta: string; periodo: string; lancamentos: number }[];
  planilha: { arquivo: string; totalConsolidado: number | null; avisos: string[] };
  conciliados: Conciliado[];
  /** créditos do extrato que parecem de marketplace e não estão na planilha */
  sobrasExtrato: { banco: LancamentoBanco; provavelCanal: string }[];
  porDia: { dia: string; valor: number; itens: number }[];
  totais: { planilha: number; conciliado: number; naoEncontrado: number; foraDoPeriodo: number };
}
