/**
 * Parser genérico de fatura de cartão a partir das linhas de texto do PDF.
 *
 * Não depende do layout exato de cada banco: procura, em cada linha, trechos
 * no formato "DATA  DESCRIÇÃO [PARCELA]  VALOR". Uma mesma linha pode conter
 * dois lançamentos (faturas Itaú são impressas em duas colunas), por isso a
 * linha é quebrada em cada data que inicia um novo lançamento.
 */

export type Banco =
  | 'itau'
  | 'bradesco'
  | 'nubank'
  | 'inter'
  | 'c6'
  | 'santander'
  | 'bb'
  | 'caixa'
  | 'desconhecido';

export type TipoLancamento = 'compra' | 'estorno' | 'pagamento' | 'encargo';

export interface LancamentoExtraido {
  data: string; // yyyy-mm-dd
  descricao: string;
  valor: number; // positivo = débito, negativo = crédito
  tipo: TipoLancamento;
  parcelaAtual: number | null;
  parcelaTotal: number | null;
  cartaoFinal: string | null;
}

export interface FaturaExtraida {
  banco: Banco;
  vencimento: string | null; // yyyy-mm-dd
  total: number | null;
  lancamentos: LancamentoExtraido[];
}

const BANCOS: { banco: Banco; re: RegExp }[] = [
  { banco: 'nubank', re: /nubank|nu pagamentos/i },
  { banco: 'itau', re: /ita[uú]\s?card|banco ita[uú]|\bita[uú]\b/i },
  { banco: 'bradesco', re: /bradesco/i },
  { banco: 'inter', re: /banco inter\b|\binter&co\b/i },
  { banco: 'c6', re: /\bc6\s?bank\b|banco c6/i },
  { banco: 'santander', re: /santander/i },
  { banco: 'bb', re: /banco do brasil|ourocard/i },
  { banco: 'caixa', re: /caixa econ[oô]mica|cart[aã]o caixa/i },
];

const MESES: Record<string, number> = {
  JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6,
  JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12,
};

const DATA_SRC = String.raw`(\d{2})[/.](\d{2})(?:[/.](\d{2,4}))?|(\d{2})\s(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\b`;
// Data que inicia um lançamento: seguida de um token com letra (a descrição).
// "03/10 125,00" (parcela seguida de valor) não inicia lançamento.
const INICIO_RE = new RegExp(String.raw`(?:^|\s)(?:${DATA_SRC})\s+(?=\S*[A-Za-zÀ-ú])`, 'gi');
const VALOR_RE =
  /(-|−)?(?:R\$\s?)?(-|−)?(?<![\d.,])(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})(\s?-)?(?![\d%])/g;

const PARCELA_RES = [
  /\bPARC(?:ELA)?\.?\s*(\d{1,2})\s*(?:\/|DE)\s*(\d{1,2})\b/i,
  /\b(\d{1,2})\s+DE\s+(\d{1,2})\b/i,
  /(?:^|\s)(\d{2})\/(\d{2})(?=\s|$)/,
];

const RESUMO_RE =
  /vencimento|limite|saldo|total d|total a pagar|pagamento m[ií]nimo|fatura anterior|melhor data|valor m[ií]nimo|subtotal|lan[cç]amentos (?:atuais|nacionais|internacionais)/i;
const PAGAMENTO_RE = /\bPAGAMENTO\b|\bPAGTO\b|\bPGTO\b|PAGAMENTO EFETUADO|CR[EÉ]DITO DE PAGAMENTO/i;
const ENCARGO_RE = /\bJUROS\b|\bIOF\b|ENCARGO|\bMULTA\b|ANUIDADE|TARIFA|MORA\b/i;

export function parseValorBR(texto: string): number {
  return Number(texto.replace(/\./g, '').replace(',', '.'));
}

function isoData(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export function detectarBanco(texto: string): Banco {
  return BANCOS.find((b) => b.re.test(texto))?.banco ?? 'desconhecido';
}

export function extrairVencimento(texto: string): string | null {
  const m = texto.match(/vencimento[^\d]{0,40}(\d{2})[/.](\d{2})[/.](\d{2,4})/i);
  if (!m) return null;
  const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return isoData(ano, Number(m[2]), Number(m[1]));
}

export function extrairTotal(texto: string): number | null {
  // Santander: "Fatura anterior - Pagamentos = Saldo + Despesas = Total" (17.960,66 - 18.090,93 = -130,27 + 23.033,34 = 22.903,07)
  const resumo = texto.match(/=\s*-?[\d.,]+\s*\+\s*[\d.,]+\s*=\s*(\d{1,3}(?:\.\d{3})*,\d{2})\b/);
  if (resumo) return parseValorBR(resumo[1]);
  // "com valor total de" / "valor total a pagar" são da oferta de parcelamento, não da fatura
  const m = texto.match(
    /(?:total (?:desta|da) fatura|total a pagar|(?<!com )valor total(?! a pagar)|total da sua fatura)[^\d\n]{0,40}(\d{1,3}(?:\.\d{3})*,\d{2})/i
  );
  return m ? parseValorBR(m[1]) : null;
}

/**
 * Datas de lançamento geralmente vêm sem ano. O ano é deduzido a partir do
 * vencimento: o lançamento nunca é posterior ao vencimento, então se o mês
 * for maior que o do vencimento, a compra foi no ano anterior (parcelas antigas).
 */
function resolverData(
  dia: number,
  mes: number,
  anoTexto: string | undefined,
  vencimento: string | null
): string | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  if (anoTexto) {
    const ano = anoTexto.length === 2 ? 2000 + Number(anoTexto) : Number(anoTexto);
    return isoData(ano, mes, dia);
  }
  const ref = vencimento ? new Date(`${vencimento}T00:00:00`) : new Date();
  let ano = ref.getFullYear();
  if (isoData(ano, mes, dia) > isoData(ano, ref.getMonth() + 1, ref.getDate())) ano -= 1;
  return isoData(ano, mes, dia);
}

function extrairParcela(descricao: string): {
  descricao: string;
  parcelaAtual: number | null;
  parcelaTotal: number | null;
} {
  for (const re of PARCELA_RES) {
    const m = descricao.match(re);
    if (!m) continue;
    const atual = Number(m[1]);
    const total = Number(m[2]);
    if (atual >= 1 && total >= 2 && atual <= total && total <= 48) {
      return {
        descricao: descricao
          .replace(m[0], ' ')
          .replace(/\s+/g, ' ')
          .replace(/[\s\-–:]+$/, '')
          .trim(),
        parcelaAtual: atual,
        parcelaTotal: total,
      };
    }
  }
  return { descricao, parcelaAtual: null, parcelaTotal: null };
}

function classificar(descricao: string, valor: number): TipoLancamento {
  if (PAGAMENTO_RE.test(descricao)) return 'pagamento';
  if (ENCARGO_RE.test(descricao)) return 'encargo';
  if (valor < 0) return 'estorno';
  return 'compra';
}

function parseSegmento(
  segmento: string,
  vencimento: string | null,
  cartaoFinal: string | null
): LancamentoExtraido | null {
  const dataMatch = segmento.match(new RegExp(`^\\s*(?:${DATA_SRC})`, 'i'));
  if (!dataMatch) return null;

  const dia = Number(dataMatch[1] ?? dataMatch[4]);
  const mes = dataMatch[2] ? Number(dataMatch[2]) : MESES[dataMatch[5].toUpperCase()];
  const data = resolverData(dia, mes, dataMatch[3], vencimento);
  if (!data) return null;

  const resto = segmento.slice(dataMatch[0].length);
  // O valor em reais é o último da linha (lançamentos internacionais trazem
  // antes o valor em moeda estrangeira).
  const valores = Array.from(resto.matchAll(VALOR_RE));
  if (valores.length === 0) return null;
  const ultimo = valores[valores.length - 1];
  const negativo = Boolean(ultimo[1] || ultimo[2] || ultimo[4]);
  const valor = parseValorBR(ultimo[3]) * (negativo ? -1 : 1);

  let descricao = resto.slice(0, valores[0].index).replace(/\b(?:R\$|US\$|USD|BRL)\s*$/i, '');
  descricao = descricao.replace(/\s+/g, ' ').trim();
  // compra internacional pode vir com descrição só de códigos ("D38163785 18007220081 ... USD"): vale a sigla da moeda
  const temTexto = /[A-Za-zÀ-ú]{2,}/.test(descricao) || /\b(?:USD|EUR|GBP|BRL)\b/.test(resto);
  if (!temTexto || RESUMO_RE.test(descricao)) return null;

  const parcela = extrairParcela(descricao);
  return {
    data,
    descricao: parcela.descricao,
    valor,
    tipo: classificar(parcela.descricao, valor),
    parcelaAtual: parcela.parcelaAtual,
    parcelaTotal: parcela.parcelaTotal,
    cartaoFinal,
  };
}

export function parseLinhas(linhas: string[]): FaturaExtraida {
  const texto = linhas.join('\n');
  const vencimento = extrairVencimento(texto);
  const lancamentos: LancamentoExtraido[] = [];
  let cartaoFinal: string | null = null;

  for (const linha of linhas) {
    const final = linha.match(/final\s*:?\s*(\d{4})\b/i) ?? linha.match(/\b\d{4}\s*X{4}\s*X{4}\s*(\d{4})\b/i);
    if (final) cartaoFinal = final[1];

    const inicios = Array.from(linha.matchAll(INICIO_RE)).map(
      (m) => m.index! + (m[0].length - m[0].trimStart().length)
    );
    for (let i = 0; i < inicios.length; i++) {
      const segmento = linha.slice(inicios[i], inicios[i + 1] ?? linha.length);
      const lancamento = parseSegmento(segmento, vencimento, cartaoFinal);
      if (lancamento) lancamentos.push(lancamento);
    }
  }

  return {
    banco: detectarBanco(texto),
    vencimento,
    total: extrairTotal(texto),
    lancamentos,
  };
}
