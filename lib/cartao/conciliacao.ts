/**
 * Conciliação automática: casa cada lançamento de compra da fatura com uma
 * compra registrada (API do marketplace, planilha importada ou cadastro manual).
 *
 * Critérios, em ordem de peso:
 *  - valor: o lançamento precisa bater com o valor da compra (ou da parcela);
 *  - loja: a descrição da fatura precisa ser compatível com a origem da compra
 *    (ex.: "MERCADOLIVRE*", "MP *" para Mercado Livre);
 *  - data: o lançamento cai até alguns dias depois da compra. Em parcelas
 *    seguintes, alguns bancos mostram a data original e outros a data da parcela,
 *    então os dois casos são aceitos.
 *
 * Uma compra parcelada pode casar com um lançamento por parcela (em faturas
 * diferentes); a chave de uso é compra + número da parcela.
 */

export interface LancamentoConciliavel {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  parcelaAtual: number | null;
  parcelaTotal: number | null;
}

export interface CompraConciliavel {
  id: string;
  origem: string;
  loja: string | null;
  descricao: string | null;
  data: string;
  valorTotal: number;
  parcelas: number;
  valorParcela: number | null;
}

export interface Vinculo {
  lancamentoId: string;
  compraId: string;
  status: 'conciliado' | 'divergente';
  diferenca: number;
  score: number;
}

export const MARCAS: Record<string, RegExp> = {
  mercadolivre: /MERCADO ?LIVRE|MERCADOLIVRE|MERCADO ?PAGO|MERCPAGO|\bMP ?\*|\bML ?\*/i,
  shopee: /SHOPEE|SHPP/i,
  magalu: /MAGALU|MAGAZINE ?LUIZA|MAGAZINELUIZA|\bMLUIZA/i,
  amazon: /AMAZON|AMZN/i,
};

const DIA_MS = 86_400_000;

function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(ate) - Date.parse(de)) / DIA_MS);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();
}

export function chaveParcela(compraId: string, parcela: number | null): string {
  return `${compraId}:${parcela ?? 1}`;
}

/** Pontuação da loja: >0 compatível, 0 neutro, null incompatível. */
function pontuarLoja(lanc: LancamentoConciliavel, compra: CompraConciliavel): number | null {
  const desc = normalizar(lanc.descricao);
  const marca = MARCAS[compra.origem];
  if (marca) {
    if (marca.test(desc)) return 40;
    const outraMarca = Object.entries(MARCAS).some(([o, re]) => o !== compra.origem && re.test(desc));
    if (outraMarca) return null;
  }
  const tokens = normalizar(compra.loja ?? '')
    .split(/[^A-Z0-9]+/)
    .filter((t) => t.length >= 3);
  if (tokens.some((t) => desc.includes(t))) return 30;
  return 0;
}

/** Pontuação da data: >0 plausível, null fora da janela. */
function pontuarData(lanc: LancamentoConciliavel, compra: CompraConciliavel): number | null {
  const diff = diasEntre(compra.data, lanc.data);
  const candidatos = [diff];
  if (lanc.parcelaAtual && lanc.parcelaAtual > 1) {
    candidatos.push(diff - Math.round((lanc.parcelaAtual - 1) * 30.4));
  }
  const melhor = Math.min(...candidatos.map((d) => (d < -3 || d > 7 ? Infinity : Math.abs(d))));
  return melhor === Infinity ? null : 20 - melhor * 2;
}

export function avaliar(
  lanc: LancamentoConciliavel,
  compra: CompraConciliavel
): Omit<Vinculo, 'lancamentoId' | 'compraId'> | null {
  if (compra.parcelas > 1 && lanc.parcelaTotal && lanc.parcelaTotal !== compra.parcelas) return null;

  const parcelas = compra.parcelas > 1 ? compra.parcelas : lanc.parcelaTotal ?? 1;
  const esperado =
    parcelas > 1
      ? compra.parcelas > 1 && compra.valorParcela
        ? compra.valorParcela
        : round2(compra.valorTotal / parcelas)
      : compra.valorTotal;
  // a primeira parcela costuma absorver os centavos do arredondamento
  const tolerancia = parcelas > 1 ? 0.01 * parcelas + 0.01 : 0.01;

  const loja = pontuarLoja(lanc, compra);
  const data = pontuarData(lanc, compra);
  if (loja === null || data === null) return null;

  const diferenca = round2(lanc.valor - esperado);
  if (Math.abs(diferenca) <= tolerancia) {
    // valor exato: exige loja compatível ou data bem próxima
    if (loja === 0 && data < 14) return null;
    return { status: 'conciliado', diferenca: 0, score: 50 + loja + data };
  }
  // valor diferente (frete, cupom, juros): só com loja confirmada e diferença até 15%
  if (loja > 0 && data >= 10 && Math.abs(diferenca) <= esperado * 0.15) {
    return { status: 'divergente', diferenca, score: 10 + loja + data };
  }
  return null;
}

export function conciliar(
  lancamentos: LancamentoConciliavel[],
  compras: CompraConciliavel[],
  parcelasJaUsadas: Set<string>
): Vinculo[] {
  const pares: Vinculo[] = [];
  for (const lanc of lancamentos) {
    for (const compra of compras) {
      const r = avaliar(lanc, compra);
      if (r) pares.push({ lancamentoId: lanc.id, compraId: compra.id, ...r });
    }
  }
  pares.sort((a, b) => b.score - a.score);

  const parcelaDe = new Map(lancamentos.map((l) => [l.id, l.parcelaAtual]));
  const lancUsados = new Set<string>();
  const usadas = new Set(parcelasJaUsadas);
  const vinculos: Vinculo[] = [];
  for (const par of pares) {
    const chave = chaveParcela(par.compraId, parcelaDe.get(par.lancamentoId) ?? null);
    if (lancUsados.has(par.lancamentoId) || usadas.has(chave)) continue;
    lancUsados.add(par.lancamentoId);
    usadas.add(chave);
    vinculos.push(par);
  }
  return vinculos;
}
