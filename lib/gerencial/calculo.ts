/**
 * Relatório Gerencial: a conta da tela e do Excel (mesmo resultado nos dois). Sem acesso a banco.
 */
import { DEPARA_PADRAO, MESES, RUBRICAS, type Ajuste, type ContaMes, type LancamentoRubrica, type Mensal } from './rubricas';

export const zeros = () => Array<number>(12).fill(0);
export const soma = (a: number[]) => a.reduce((s, v) => s + v, 0);

export interface ContaLinha {
  conta: string;
  nome: string;
  grupo: string;
  v: number[];
  padrao: string; // rubrica do de-para padrão ('' = nenhuma)
  trocada: boolean; // o controle mudou a rubrica
  porLancamento?: boolean; // linha formada por pagamentos escolhidos um a um
}

export type CampoMensal = keyof Omit<Mensal, 'ano' | 'mes'>;

export interface DadosGerencial {
  contas: ContaMes[];
  ajustes: Ajuste[];
  depara: Record<string, string>;
  mensal: Mensal[];
  parametros: Record<string, number>;
  ultimoMesFechado: number;
  lancamentos?: LancamentoRubrica[];
}

export function calcular({ contas, ajustes, depara, mensal, parametros, ultimoMesFechado, lancamentos = [] }: DadosGerencial) {
  const rubDe = (conta: string) => depara[conta] ?? DEPARA_PADRAO[conta] ?? '';
  const contasPorRub = new Map<string, Map<string, ContaLinha>>();
  const porRub = new Map<string, number[]>();
  const ajPorRub = new Map<string, number[]>();
  for (const c of contas) {
    const rub = rubDe(c.conta);
    if (!contasPorRub.has(rub)) contasPorRub.set(rub, new Map());
    const m = contasPorRub.get(rub)!;
    const l =
      m.get(c.conta) ??
      ({ conta: c.conta, nome: c.nome, grupo: c.grupo, v: zeros(), padrao: DEPARA_PADRAO[c.conta] ?? '', trocada: c.conta in depara } as ContaLinha);
    l.v[c.mes - 1] += c.valor;
    m.set(c.conta, l);
    if (!porRub.has(rub)) porRub.set(rub, zeros());
    porRub.get(rub)![c.mes - 1] += c.valor;
  }
  // pagamentos com rubrica escolhida um a um: saem da rubrica da conta e entram na escolhida
  for (const o of lancamentos) {
    const orig = rubDe(o.conta);
    const src = contasPorRub.get(orig)?.get(o.conta);
    if (!src || orig === o.rubrica || o.mes < 1 || o.mes > 12) continue;
    const i = o.mes - 1;
    src.v[i] -= o.valor;
    porRub.get(orig)![i] -= o.valor;
    if (!contasPorRub.has(o.rubrica)) contasPorRub.set(o.rubrica, new Map());
    const m = contasPorRub.get(o.rubrica)!;
    const dest =
      m.get(o.conta) ?? ({ conta: o.conta, nome: src.nome, grupo: src.grupo, v: zeros(), padrao: src.padrao, trocada: true, porLancamento: true } as ContaLinha);
    dest.v[i] += o.valor;
    m.set(o.conta, dest);
    if (!porRub.has(o.rubrica)) porRub.set(o.rubrica, zeros());
    porRub.get(o.rubrica)![i] += o.valor;
  }
  for (const a of ajustes) {
    for (const [rub, sinal] of [
      [a.de_rubrica, -1],
      [a.para_rubrica, 1],
    ] as const) {
      if (!rub) continue;
      if (!porRub.has(rub)) porRub.set(rub, zeros());
      if (!ajPorRub.has(rub)) ajPorRub.set(rub, zeros());
      porRub.get(rub)![a.mes - 1] += sinal * a.valor;
      ajPorRub.get(rub)![a.mes - 1] += sinal * a.valor;
    }
  }
  const total = zeros();
  for (const v of Array.from(porRub.values())) v.forEach((x, i) => (total[i] += x));

  const mes = (m: number) => mensal.find((x) => x.mes === m);
  const linhaMensal = (id: CampoMensal) => MESES.map((_, i) => mes(i + 1)?.[id] ?? 0);
  const fat = linhaMensal('faturamento');
  const receb = linhaMensal('recebimento');

  // meses da média: fechados e com despesa
  const fechados = MESES.map((_, i) => i).filter((i) => i < Math.max(ultimoMesFechado, 1) && Math.abs(total[i]) > 0.5);
  const nMeses = fechados.length || 1;
  const somaMeses = (v: number[]) => fechados.reduce((s, i) => s + v[i], 0);
  const mesesReceb = fechados.filter((i) => receb[i] > 0);
  const mediaReceb = mesesReceb.length ? mesesReceb.reduce((s, i) => s + receb[i], 0) / mesesReceb.length : 0;
  const fatFechado = somaMeses(fat);
  const recebFechado = somaMeses(receb);
  // % s/ faturamento (e s/ recebimento): só nos meses fechados em que o valor do mês foi lançado
  const mesesFat = fechados.filter((i) => fat[i] > 0);
  const mesesRecebOk = fechados.filter((i) => receb[i] > 0);
  const sobre = (v: number[], base: number[], meses: number[]) => {
    const b = meses.reduce((s, i) => s + base[i], 0);
    return b ? meses.reduce((s, i) => s + v[i], 0) / b : null;
  };
  const pctFat = (v: number[]) => sobre(v, fat, mesesFat);
  const pctReceb = (v: number[]) => sobre(v, receb, mesesRecebOk);
  /** média de uma linha digitada (faturamento, recebimento…): só nos meses com valor */
  const mediaLancada = (v: number[]) => {
    const ms = fechados.filter((i) => Math.abs(v[i]) > 0.005);
    return ms.length ? ms.reduce((s, i) => s + v[i], 0) / ms.length : 0;
  };

  const semRubrica = Array.from(contasPorRub.get('')?.values() ?? [])
    .filter((c) => c.v.some((x) => Math.abs(x) > 0.005))
    .sort((a, b) => soma(b.v) - soma(a.v));
  const param = (cod: string) => parametros[cod] ?? RUBRICAS.find((r) => r.cod === cod)?.parametro ?? 0;
  const ultimoComDado = Math.max(...MESES.map((_, i) => (Math.abs(total[i]) > 0.5 || fat[i] ? i : -1)));
  const colunas = MESES.map((_, i) => i).filter((i) => i <= Math.max(ultimoComDado, 0));

  return {
    contasPorRub,
    porRub,
    ajPorRub,
    total,
    fat,
    receb,
    linhaMensal,
    fechados,
    nMeses,
    somaMeses,
    mediaReceb,
    fatFechado,
    recebFechado,
    mesesFat,
    pctFat,
    pctReceb,
    mediaLancada,
    semRubrica,
    param,
    colunas,
  };
}
