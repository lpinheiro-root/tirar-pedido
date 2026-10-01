/**
 * Situação de uma compra parcelada num mês de referência (mês de vencimento
 * da fatura, formato yyyy-mm).
 *
 * - Confirmado: a compra já foi casada com um lançamento de alguma fatura
 *   (parcela k na fatura que vence no mês V); a parcela no mês M é
 *   k + (M − V), sem estimativa.
 * - Estimado: sem fatura casada, assume que a 1ª parcela cai na fatura que
 *   vence no mês seguinte ao da compra (o caso mais comum; compras feitas
 *   antes do fechamento podem cair na fatura do próprio mês).
 */

export interface CompraParcelada {
  data: string; // yyyy-mm-dd
  parcelas: number;
  valor_total: number;
  valor_parcela: number | null;
}

export interface LancamentoDaCompra {
  parcela_atual: number | null;
  vencimento: string | null; // vencimento da fatura onde apareceu
}

export interface SituacaoParcela {
  /** parcela que vence no mês (null se ainda não começou ou já quitada) */
  parcela: number | null;
  total: number;
  /** parcelas que ainda faltam depois da do mês */
  faltam: number;
  /** valor que vence no mês */
  valorMes: number;
  estado: 'a_vencer' | 'no_mes' | 'quitada';
  confirmado: boolean;
  /** mês (yyyy-mm) em que cai a 1ª parcela, para "começa em ..." */
  inicio: string;
}

function indiceMes(yyyyMm: string): number {
  const [ano, mes] = yyyyMm.slice(0, 7).split('-').map(Number);
  return ano * 12 + (mes - 1);
}

function mesDoIndice(i: number): string {
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}

export function mesAtual(): string {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
}

export function situacaoNoMes(
  compra: CompraParcelada,
  mesRef: string,
  lancamentos: LancamentoDaCompra[]
): SituacaoParcela {
  const total = Math.max(1, compra.parcelas);
  const valorParcela =
    total > 1 ? Number(compra.valor_parcela ?? Number(compra.valor_total) / total) : Number(compra.valor_total);

  // mês em que cai a 1ª parcela
  const ancora = lancamentos.find((l) => l.vencimento);
  const confirmado = Boolean(ancora);
  const inicioIdx = ancora
    ? indiceMes(ancora.vencimento!) - ((ancora.parcela_atual ?? 1) - 1)
    : indiceMes(compra.data) + 1;

  const parcela = indiceMes(mesRef) - inicioIdx + 1;
  const base = { total, confirmado, inicio: mesDoIndice(inicioIdx) };

  if (parcela < 1) return { ...base, parcela: null, faltam: total, valorMes: 0, estado: 'a_vencer' };
  if (parcela > total) return { ...base, parcela: null, faltam: 0, valorMes: 0, estado: 'quitada' };
  return { ...base, parcela, faltam: total - parcela, valorMes: Math.round(valorParcela * 100) / 100, estado: 'no_mes' };
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function rotuloMes(yyyyMm: string): string {
  const [ano, mes] = yyyyMm.split('-').map(Number);
  return `${MESES[mes - 1]}/${ano}`;
}

/** Texto curto: "2ª de 5 · faltam 3", "Última (5ª de 5)", "Quitada", "Começa em nov/2026". */
export function textoSituacao(s: SituacaoParcela): string {
  if (s.estado === 'quitada') return s.total === 1 ? 'Paga' : 'Quitada';
  if (s.estado === 'a_vencer') return `Começa em ${rotuloMes(s.inicio)}`;
  if (s.total === 1) return 'À vista';
  if (s.faltam === 0) return `Última (${s.parcela}ª de ${s.total})`;
  return `${s.parcela}ª de ${s.total} · ${s.faltam === 1 ? 'falta 1' : `faltam ${s.faltam}`}`;
}
