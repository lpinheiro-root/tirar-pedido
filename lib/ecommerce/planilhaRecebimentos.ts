import type ExcelJS from 'exceljs';
import type { ItemPlanilha, PlanilhaLida } from './tipos';

/**
 * Lê a planilha "RECEBIMENTO E-COMMERCE" (uma aba por marketplace) e devolve
 * cada saque/repasse que deve cair no banco. Cada aba vem do export do próprio
 * marketplace, então cada uma tem um leitor. Ficam de fora o CONSOLIDADO (só o
 * total, para conferência) e as saídas de Ads (não são conciliadas).
 */

type Celula = ExcelJS.CellValue;
type Linha = Celula[];

const MESES: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};
const sem = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
const iso = (a: number, m: number, d: number) =>
  `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

function valorDe(c: Celula): unknown {
  if (c && typeof c === 'object' && !(c instanceof Date)) {
    const o = c as { result?: unknown; richText?: { text: string }[]; text?: string };
    if ('result' in o) return o.result;
    if (o.richText) return o.richText.map((t) => t.text).join('');
    if (o.text != null) return o.text;
  }
  return c;
}
const texto = (c: Celula) => {
  const v = valorDe(c);
  return v == null ? '' : v instanceof Date ? v.toISOString() : String(v).trim();
};
function numeroDe(c: Celula): number | null {
  const v = valorDe(c);
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && /^-?[\d.]*,\d+$/.test(v.trim())) return Number(v.replace(/\./g, '').replace(',', '.'));
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  return null;
}

/** Datas nos vários formatos dos exports: 2026-09-30, 2026/09/30, 1/9/2026, "4 de set. de 2026", "23 de setembro". */
export function dataDe(c: Celula, anoPadrao: number): string | null {
  const v = valorDe(c);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = sem(String(v ?? ''));
  let m = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = s.match(/\b(\d{1,2}) de ([a-z]{3})[a-z]*\.?(?: de (\d{4}))?/);
  if (m && MESES[m[2]]) return iso(m[3] ? +m[3] : anoPadrao, MESES[m[2]], +m[1]);
  return null;
}

function linhas(ws: ExcelJS.Worksheet): Linha[] {
  const out: Linha[] = [];
  ws.eachRow({ includeEmpty: true }, (row, i) => {
    out[i] = (row.values as Linha).slice(1);
  });
  return Array.from(out, (l) => l ?? []);
}

/** acha a linha de cabeçalho que tem todas as colunas pedidas e devolve os índices */
function cabecalho(ls: Linha[], colunas: string[]) {
  for (let i = 0; i < ls.length; i++) {
    const nomes = ls[i].map((c) => sem(texto(c)));
    const idx = colunas.map((c) => nomes.findIndex((n) => n === sem(c)));
    if (idx.every((x) => x >= 0)) return { linha: i, idx };
  }
  return null;
}

type Leitor = (ls: Linha[], canal: string, ano: number) => Omit<ItemPlanilha, 'id'>[] | null;

// Shopee: "Detalhes da transação" com os saques
const shopee: Leitor = (ls, canal, ano) => {
  const h = cabecalho(ls, ['Data', 'Tipo de transação', 'Valor']);
  if (!h) return null;
  const [cData, cTipo, cValor] = h.idx;
  return ls
    .slice(h.linha + 1)
    .filter((l) => /saque/i.test(texto(l[cTipo])) && numeroDe(l[cValor]))
    .map((l) => ({ canal, valor: Math.abs(numeroDe(l[cValor])!), data: dataDe(l[cData], ano), referencia: `Saque ${texto(l[cData])}` }));
};

// Shein: cada parte do saque cai separada no banco ("Valor líquido")
const shein: Leitor = (ls, canal, ano) => {
  const h = cabecalho(ls, ['Valor líquido', 'Tempo de sucesso de retirada', 'Número do pedido de retirada']);
  if (!h) return null;
  const [cValor, cData, cPedido] = h.idx;
  return ls
    .slice(h.linha + 1)
    .filter((l) => numeroDe(l[cValor]))
    .map((l) => ({ canal, valor: numeroDe(l[cValor])!, data: dataDe(l[cData], ano), referencia: `Retirada ${texto(l[cPedido])}` }));
};

// TikTok Shop: um pagamento por dia
const tiktok: Leitor = (ls, canal, ano) => {
  const h = cabecalho(ls, ['Valor do pagamento', 'Data de conclusão do pagamento', 'ID do pagamento']);
  if (!h) return null;
  const [cValor, cData, cId] = h.idx;
  return ls
    .slice(h.linha + 1)
    .filter((l) => numeroDe(l[cValor]) && texto(l[cId]))
    .map((l) => ({ canal, valor: numeroDe(l[cValor])!, data: dataDe(l[cData], ano), referencia: `Pagamento ${texto(l[cId])}` }));
};

// Pagar.me: status | id | data | conta | valor
const pagarme: Leitor = (ls, canal, ano) =>
  ls
    .filter((l) => numeroDe(l[4]) && dataDe(l[2], ano))
    .map((l) => ({ canal, valor: numeroDe(l[4])!, data: dataDe(l[2], ano), referencia: `Saque ${texto(l[1])}` }));

// Amazon 3P: linhas "Transferir" (valor negativo em uma das colunas de valores)
const amazon3p: Leitor = (ls, canal, ano) => {
  const h = cabecalho(ls, ['tipo', 'tipo de conta']);
  if (!h) return null;
  const nomes = ls[h.linha].map((c) => sem(texto(c)));
  const cData = nomes.findIndex((n) => n.startsWith('data de liberacao'));
  return ls
    .slice(h.linha + 1)
    .filter((l) => sem(texto(l[h.idx[0]])) === 'transferir')
    .map((l) => {
      const valor = l.map(numeroDe).find((n) => n != null && n < 0) ?? 0;
      return { canal, valor: Math.abs(valor), data: cData >= 0 ? dataDe(l[cData], ano) : null, referencia: `Transferência ${texto(l[h.idx[1]])}` };
    })
    .filter((i) => i.valor);
};

// Amazon 1P: pagamentos (Número / Data / ... / Valor na moeda de pagamento)
const amazon1p: Leitor = (ls, canal, ano) => {
  const h = cabecalho(ls, ['Número do pagamento', 'Data do pagamento', 'Valor na moeda de pagamento']);
  if (!h) return null;
  const [cNum, cData, cValor] = h.idx;
  return ls
    .slice(h.linha + 1)
    .filter((l) => texto(l[cNum]) && numeroDe(l[cValor]))
    .map((l) => ({ canal, valor: numeroDe(l[cValor])!, data: dataDe(l[cData], ano), referencia: `Pagamento ${texto(l[cNum])}` }));
};

// Temu: texto copiado da tela; o valor vem na linha depois de "Valor do pagamento"
const temu: Leitor = (ls, canal) => {
  const itens: Omit<ItemPlanilha, 'id'>[] = [];
  for (let i = 1; i < ls.length; i++) {
    if (sem(texto(ls[i - 1][0])) !== 'valor do pagamento') continue;
    const valor = numeroDe(ls[i][0]);
    const idPag = ls.slice(i, i + 6).findIndex((l) => sem(texto(l[0])) === 'id de pagamento');
    if (valor) itens.push({ canal, valor, data: null, referencia: idPag >= 0 ? `Pagamento ${texto(ls[i + idPag + 1]?.[0])}` : 'Pagamento' });
  }
  return itens;
};

// Mercado Livre: texto copiado do extrato do Mercado Pago (dia, hora, destino, "Pix enviado", valor negativo)
const mercadoLivre: Leitor = (ls, canal, ano) => {
  const itens: Omit<ItemPlanilha, 'id'>[] = [];
  let dia: string | null = null;
  let mov = '';
  for (const l of ls) {
    const t = texto(l[0]);
    if (/^\d{1,2} de [a-zç]+$/i.test(t)) dia = dataDe(t, ano);
    if (/^Movimento/i.test(t)) mov = t;
    const n = numeroDe(l[0]);
    if (n != null && n < 0 && !(l[0] && typeof l[0] === 'object' && 'formula' in (l[0] as object))) {
      itens.push({ canal, valor: Math.abs(n), data: dia, referencia: mov || 'Pix enviado' });
    }
  }
  return itens;
};

// Pagali / Magalu e abas simples: números soltos na coluna A (texto com a data acima)
const simples: Leitor = (ls, canal, ano) => {
  const itens: Omit<ItemPlanilha, 'id'>[] = [];
  let data: string | null = null;
  for (const l of ls) {
    const n = numeroDe(l[0]);
    if (n == null) {
      data = dataDe(l[0], ano) ?? data;
      continue;
    }
    if (n) itens.push({ canal, valor: Math.abs(n), data, referencia: 'Saque' });
  }
  return itens;
};

const LEITORES: { teste: RegExp; leitor: Leitor }[] = [
  { teste: /^shopee/, leitor: shopee },
  { teste: /^shein/, leitor: shein },
  { teste: /^tik ?tok/, leitor: tiktok },
  { teste: /^pagar\.?me/, leitor: pagarme },
  { teste: /^amazon 3p/, leitor: amazon3p },
  { teste: /^amazon 1p/, leitor: amazon1p },
  { teste: /^temu/, leitor: temu },
  { teste: /^mercado livre/, leitor: mercadoLivre },
  { teste: /^(pagali|magalu)/, leitor: simples },
];

export async function lerPlanilhaRecebimentos(arquivo: string, dados: ArrayBuffer, ano: number): Promise<PlanilhaLida> {
  const ExcelJSMod = (await import('exceljs')).default;
  const wb = new ExcelJSMod.Workbook();
  await wb.xlsx.load(dados);

  const itens: ItemPlanilha[] = [];
  const avisos: string[] = [];
  let totalConsolidado: number | null = null;

  for (const ws of wb.worksheets) {
    const nome = ws.name.replace(/\s+/g, ' ').trim();
    const chave = sem(nome);
    const ls = linhas(ws);
    if (chave === 'consolidado') {
      for (const l of ls) {
        const i = l.findIndex((c) => sem(texto(c)) === 'total de entradas');
        const n = i >= 0 ? numeroDe(l[i + 1]) : null;
        if (n != null) totalConsolidado = Math.round(n * 100) / 100;
      }
      continue;
    }
    if (/^said/.test(chave) || /ads/.test(chave)) continue; // saídas de Ads: não concilia
    const regra = LEITORES.find((r) => r.teste.test(chave));
    const lidos = regra?.leitor(ls, nome, ano) ?? null;
    if (!regra || lidos == null) {
      avisos.push(`Aba "${nome}": formato não reconhecido, ficou de fora.`);
      continue;
    }
    if (!lidos.length) avisos.push(`Aba "${nome}": sem valores (pendente?).`);
    for (const it of lidos) itens.push({ ...it, valor: Math.round(it.valor * 100) / 100, id: itens.length + 1 });
  }

  const soma = Math.round(itens.reduce((s, i) => s + i.valor, 0) * 100) / 100;
  if (totalConsolidado != null && Math.abs(soma - totalConsolidado) > 0.01) {
    avisos.push(
      `A soma das abas (${soma.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) é diferente do TOTAL DE ENTRADAS do CONSOLIDADO (${totalConsolidado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`
    );
  }
  return { arquivo, itens, totalConsolidado, avisos };
}
