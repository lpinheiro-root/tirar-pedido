import { getDocumentProxy } from 'unpdf';

/**
 * Leitor do "Borderô Comprimido Analítico" do Meus Recebíveis (RGB), o mesmo sistema usado por
 * Amplic, Crescer, Lecca (RIVO), Prévia, Goal, Lira e Lavoro. O PDF é lido como linhas de texto
 * (itens agrupados pela altura na página); cabeçalho e títulos saem das linhas, e o resumo
 * (deságio, despesas, líquido...) sai da sequência de textos, porque em alguns PDFs (Lecca) o
 * rótulo e o valor ficam em linhas diferentes.
 */

export interface TituloBordero {
  ordem: number;
  numero: string;
  vencimento: string | null;
  sacado: string;
  valor: number;
  desagio: number;
  desagiado: number;
}

export interface Bordero {
  fidcNome: string;
  tipo: string;
  cedenteNome: string;
  cedenteCnpj: string;
  /** Telefone do cedente (o DDD diz a filial da Veneza). */
  cedenteTelefone: string;
  numero: string;
  data: string; // AAAA-MM-DD
  qtdTitulos: number;
  bruto: number;
  desagio: number;
  taxaServico: number;
  iss: number;
  iof: number;
  despesasBancarias: number;
  liquidoOperacao: number;
  recompra: number;
  desconto: number;
  /** Custo da FIDC: bruto − líquido da operação − desconto (= coluna "Despesas" da planilha). */
  despesas: number;
  /** Pago ao cedente (= "VALOR/liquido" da planilha). */
  liquido: number;
  titulos: TituloBordero[];
  avisos: string[];
}

type Linha = string[];

const MOEDA = /^-?\d{1,3}(\.\d{3})*,\d{2}$/;
const DATA = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const CNPJ = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/;
const valor = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));
const iso = (s: string) => {
  const m = s.match(DATA);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Texto do PDF em linhas (de cima para baixo, da esquerda para a direita), página após página. */
export async function linhasDoPdf(dados: ArrayBuffer | Uint8Array): Promise<Linha[]> {
  const pdf = await getDocumentProxy(dados instanceof Uint8Array ? dados : new Uint8Array(dados));
  const linhas: Linha[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const { items } = await page.getTextContent();
    const porY: { y: number; itens: { x: number; s: string }[] }[] = [];
    for (const it of items) {
      if (!('str' in it) || !it.str.trim()) continue;
      const y = it.transform[5];
      const x = it.transform[4];
      let l = porY.find((g) => Math.abs(g.y - y) <= 2);
      if (!l) porY.push((l = { y, itens: [] }));
      l.itens.push({ x, s: it.str.trim() });
    }
    porY.sort((a, b) => b.y - a.y);
    for (const l of porY) linhas.push(l.itens.sort((a, b) => a.x - b.x).map((i) => i.s));
  }
  return linhas;
}

function campoDaLinha(linhas: Linha[], rotulo: RegExp): Linha | null {
  for (const l of linhas) {
    const i = l.findIndex((t) => rotulo.test(t));
    if (i >= 0) return l.slice(i + 1);
  }
  return null;
}

/** Primeiro valor em R$ depois do rótulo, pulando percentuais; para no próximo rótulo ("....."). */
function valorDoResumo(textos: string[], rotulo: RegExp): number | null {
  const i = textos.findIndex((t) => rotulo.test(t));
  if (i < 0) return null;
  for (let j = i + 1; j < Math.min(textos.length, i + 6); j++) {
    const t = textos[j];
    if (/\.{3,}/.test(t) || /^Pago ao Cedente/.test(t)) return null;
    if (t.includes('%')) continue;
    if (MOEDA.test(t)) return valor(t);
  }
  return null;
}

export function lerBordero(linhas: Linha[]): Bordero {
  const avisos: string[] = [];
  const textos = linhas.flat();
  if (!textos.some((t) => /Border[ôo]/i.test(t))) throw new Error('Não parece um borderô do Meus Recebíveis.');

  const fidcNome = (campoDaLinha(linhas, /^Empresa:$/) ?? []).join(' ').trim();
  const tipo = (campoDaLinha(linhas, /^Tipo:$/) ?? []).join(' ').trim();
  const cedenteNome = (campoDaLinha(linhas, /^Nome:$/) ?? []).join(' ').replace(/\s+/g, ' ').trim();
  const cedenteCnpj = (campoDaLinha(linhas, /^CNPJ:$/) ?? []).find((t) => CNPJ.test(t)) ?? '';
  const cedenteTelefone = (campoDaLinha(linhas, /^Telefone:$/) ?? []).join(' ').trim();
  const linhaNumero =campoDaLinha(linhas, /^Border[ôo] Número:$/) ?? [];
  const numero = linhaNumero[0] && !/:$/.test(linhaNumero[0]) ? linhaNumero[0] : '';
  const iData = linhaNumero.findIndex((t) => /^Data:$/.test(t));
  const data = iData >= 0 ? iso(linhaNumero[iData + 1] ?? '') : null;
  if (!fidcNome) throw new Error('Não achei o nome da FIDC ("Empresa:") no borderô.');
  if (!numero) throw new Error('Não achei o número do borderô.');
  if (!data) throw new Error('Não achei a data do borderô.');

  const titulos: TituloBordero[] = [];
  for (const l of linhas) {
    // número do título: "12345-1" (Amplic, Crescer, Lecca) ou só "844601" (Goal)
    if (!/^\d+(-\d+)?$/.test(l[0] ?? '') || !DATA.test(l[1] ?? '')) continue;
    const iValor = l.findIndex((t, i) => i >= 2 && MOEDA.test(t));
    const moedas = l.filter((t, i) => i > iValor && MOEDA.test(t));
    if (iValor < 0 || moedas.length < 3) continue;
    titulos.push({
      ordem: titulos.length + 1,
      numero: l[0],
      vencimento: iso(l[1]),
      sacado: l.slice(2, iValor).join(' ').replace(/\s+/g, ' '),
      valor: valor(l[iValor]),
      desagio: valor(moedas[moedas.length - 2]),
      desagiado: valor(moedas[moedas.length - 1]),
    });
  }

  const bruto = valorDoResumo(textos, /^Valor total dos t[íi]tulos/i);
  const liquidoOperacao = valorDoResumo(textos, /^L[íi]quido da opera/i);
  if (bruto == null || liquidoOperacao == null) throw new Error('Não achei o resumo do borderô (valor total / líquido da operação).');
  const qtdTexto = textos[textos.findIndex((t) => /^N[úu]mero de t[íi]tulos/i.test(t)) + 1] ?? '';
  const qtdTitulos = /^\d+$/.test(qtdTexto) ? Number(qtdTexto) : titulos.length;

  const desagio = valorDoResumo(textos, /^(Des[áa]gio|Fator)\.{3,}/i) ?? 0;
  const taxaServico = valorDoResumo(textos, /^Taxa de servi/i) ?? 0;
  const iss = valorDoResumo(textos, /^I\.S\.S/i) ?? 0;
  const iof = valorDoResumo(textos, /^I\.O\.F/i) ?? 0;
  const despesasBancarias = valorDoResumo(textos, /^Despesas banc/i) ?? 0;
  const recompra = valorDoResumo(textos, /^Recompra\.{3,}/i) ?? 0;
  const desconto = valorDoResumo(textos, /^Desconto concedido/i) ?? 0;
  const iPago = textos.findIndex((t) => /^Pago ao Cedente$/i.test(t));
  const pago = iPago >= 0 ? textos.slice(iPago + 1, iPago + 4).find((t) => MOEDA.test(t)) : undefined;
  const liquido = pago ? valor(pago) : r2(liquidoOperacao - recompra);
  const despesas = r2(bruto - liquidoOperacao - desconto);

  // conferências (não impedem a importação; aparecem como aviso)
  if (titulos.length !== qtdTitulos) avisos.push(`O borderô diz ${qtdTitulos} títulos e eu li ${titulos.length}.`);
  const somaTitulos = r2(titulos.reduce((s, t) => s + t.valor, 0));
  // em algumas FIDCs (Crescer) o valor total já inclui o desconto concedido ao sacado
  if (titulos.length && Math.abs(somaTitulos - bruto) > 0.05 && Math.abs(somaTitulos + desconto - bruto) > 0.05)
    avisos.push(`A soma dos títulos (${somaTitulos.toFixed(2)}) não bate com o valor total (${bruto.toFixed(2)}).`);
  const custoSomado = r2(desagio + taxaServico + iss + iof + despesasBancarias);
  if (Math.abs(custoSomado - despesas) > 0.05)
    avisos.push(`Deságio + taxas + despesas bancárias (${custoSomado.toFixed(2)}) não bate com o custo calculado (${despesas.toFixed(2)}).`);
  if (Math.abs(r2(liquidoOperacao - recompra) - liquido) > 0.05)
    avisos.push(`Pago ao cedente (${liquido.toFixed(2)}) diferente de líquido − recompra (${r2(liquidoOperacao - recompra).toFixed(2)}).`);

  return {
    fidcNome,
    tipo,
    cedenteNome,
    cedenteCnpj,
    cedenteTelefone,
    numero,
    data,
    qtdTitulos,
    bruto,
    desagio,
    taxaServico,
    iss,
    iof,
    despesasBancarias,
    liquidoOperacao,
    recompra,
    desconto,
    despesas,
    liquido,
    titulos,
    avisos,
  };
}
