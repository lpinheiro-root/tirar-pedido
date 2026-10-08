import type ExcelJS from 'exceljs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buscarTodas } from '@/lib/supabasePaginado';

/**
 * Memória da planilha "Cartões" do financeiro: cada linha já descrita pela
 * equipe (empresa, vencimento, valor, parcela, estabelecimento, descrição,
 * conta contábil). Serve para preencher o Excel exportado como eles fazem:
 *  - parcela de compra antiga: copia o que foi escrito nas parcelas anteriores;
 *  - estabelecimento conhecido (Sem Parar, Hoteis.com, Obramax…): usa o nome
 *    que eles usam e, se for sempre igual, a descrição e a conta contábil.
 */

export interface Classificacao {
  empresa: string;
  vencimento: string | null;
  valor: number;
  parcela_atual: number | null;
  parcela_total: number | null;
  estabelecimento: string | null;
  descricao: string | null;
  conta_contabil: string | null;
}

export interface Sugestao {
  estabelecimento: string | null;
  descricao: string | null;
  conta: string | null;
  fonte: 'parcela' | 'estabelecimento' | null;
}

const sem = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
export const normalizarEmpresa = (s: string) => sem(s).toUpperCase().replace(/\s+/g, ' ').trim();
const SEM_INFO = /j[aá] discriminad|^-?$/i;

function texto(c: ExcelJS.CellValue): string {
  if (c == null) return '';
  if (typeof c === 'object' && !(c instanceof Date)) {
    const o = c as {
      result?: unknown;
      richText?: { text: string }[];
      text?: string;
    };
    if (o.richText) return o.richText.map((t) => t.text).join('');
    if ('result' in o) return o.result == null ? '' : String(o.result);
    return o.text ?? '';
  }
  return String(c);
}
function numero(c: ExcelJS.CellValue): number | null {
  if (typeof c === 'number') return c;
  if (c && typeof c === 'object' && 'formula' in (c as object)) return null; // soma do bloco
  const s = texto(c).trim();
  if (/^-?\d+([.,]\d+)?$/.test(s)) return Number(s.replace(',', '.'));
  return null;
}
function parcela(c: ExcelJS.CellValue): [number, number] | null {
  const m = texto(c).match(/(\d{1,2})\s*a?\s*\/\s*(\d{1,2})/i);
  if (!m) return null;
  const [a, t] = [Number(m[1]), Number(m[2])];
  return a >= 1 && t >= 1 && a <= t ? [a, t] : null;
}

/** Lê as abas "Cartão <empresa>" da planilha Cartões (blocos "Fatura-cartão EMPRESA dd/mm/aaaa"). */
export async function lerPlanilhaCartoes(dados: ArrayBuffer): Promise<{ linhas: Classificacao[]; blocos: number }> {
  const ExcelJSMod = (await import('exceljs')).default;
  const wb = new ExcelJSMod.Workbook();
  await wb.xlsx.load(dados);
  const linhas: Classificacao[] = [];
  let blocos = 0;

  for (const ws of wb.worksheets) {
    if (!/^cart/i.test(sem(ws.name).trim())) continue; // Planilha1/2/3 são rascunhos
    let atual: {
      empresa: string;
      vencimento: string | null;
      col: number;
      temConta: boolean;
    } | null = null;
    ws.eachRow({ includeEmpty: false }, (row) => {
      // título do bloco pode começar na coluna A, B ou C
      for (let col = 1; col <= 4; col++) {
        const m = texto(row.getCell(col).value).match(/Fatura-?\s*cart[aã]o\s+(.+?)\s+(\d{2})\/(\d{2})\/(\d{4})/i);
        if (m) {
          atual = {
            empresa: normalizarEmpresa(m[1]),
            vencimento: `${m[4]}-${m[3]}-${m[2]}`,
            col,
            temConta: false,
          };
          blocos++;
          return;
        }
      }
      if (!atual) return;
      const bloco = atual as {
        empresa: string;
        vencimento: string | null;
        col: number;
        temConta: boolean;
      };
      const c = bloco.col;
      if (/despesas/i.test(texto(row.getCell(c).value))) {
        bloco.temConta = /conta/i.test(texto(row.getCell(c + 4).value));
        return;
      }
      const valor = numero(row.getCell(c).value);
      if (valor == null) return;
      const p = parcela(row.getCell(c + 1).value);
      const limpo = (v: string) => v.replace(/\s+/g, ' ').trim() || null;
      linhas.push({
        empresa: bloco.empresa,
        vencimento: bloco.vencimento,
        valor: Math.round(valor * 100) / 100,
        parcela_atual: p?.[0] ?? null,
        parcela_total: p?.[1] ?? null,
        estabelecimento: limpo(texto(row.getCell(c + 2).value)),
        descricao: limpo(texto(row.getCell(c + 3).value)),
        conta_contabil: bloco.temConta ? limpo(texto(row.getCell(c + 4).value)) : null,
      });
    });
  }
  return { linhas, blocos };
}

/**
 * Chaves de um nome de estabelecimento: 1ª palavra e as duas primeiras juntas
 * ("Mercado Livre" → mercado, mercadolivre). Com intermediador de pagamento na
 * frente ("EBN *ADOBE", "ZP*CLICKBUS", "MP *LOJA") vale também o nome depois do "*".
 */
function chaves(nome: string): string[] {
  const deUmTrecho = (trecho: string) => {
    const palavras = sem(trecho)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    return [palavras[0], (palavras[0] ?? '') + (palavras[1] ?? '')];
  };
  const depoisDoAsterisco = nome.includes('*') ? nome.slice(nome.indexOf('*') + 1) : '';
  const ks = [...deUmTrecho(nome), ...(depoisDoAsterisco ? deUmTrecho(depoisDoAsterisco) : [])].filter(
    (k) => k && k.length >= 4 && !/^\d+$/.test(k)
  );
  return Array.from(new Set(ks));
}

/** o que mais aparece (só se for a maioria clara) */
function maioria(valores: (string | null)[], minimo = 0.6): string | null {
  const v = valores.filter((x): x is string => Boolean(x) && !SEM_INFO.test(x!));
  if (!v.length) return null;
  const cont = new Map<string, number>();
  v.forEach((x) => cont.set(x, (cont.get(x) ?? 0) + 1));
  const [melhor, n] = Array.from(cont).sort((a, b) => b[1] - a[1])[0];
  return n / v.length >= minimo ? melhor : null;
}

export class MemoriaCartoes {
  private porEmpresa = new Map<string, Classificacao[]>();
  private porChave = new Map<string, Classificacao[]>();

  constructor(linhas: Classificacao[]) {
    const ordenadas = [...linhas].sort((a, b) => (b.vencimento ?? '').localeCompare(a.vencimento ?? '')); // mais recentes primeiro
    for (const l of ordenadas) {
      const e = normalizarEmpresa(l.empresa);
      if (!this.porEmpresa.has(e)) this.porEmpresa.set(e, []);
      this.porEmpresa.get(e)!.push(l);
      if (l.estabelecimento) {
        for (const k of chaves(l.estabelecimento)) {
          if (!this.porChave.has(k)) this.porChave.set(k, []);
          this.porChave.get(k)!.push(l);
        }
      }
    }
  }

  get tamanho() {
    return Array.from(this.porEmpresa.values()).reduce((s, l) => s + l.length, 0);
  }

  sugerir(
    empresa: string,
    descricaoFatura: string,
    valor: number,
    parcelaAtual: number | null,
    parcelaTotal: number | null
  ): Sugestao {
    const historico = this.porEmpresa.get(normalizarEmpresa(empresa)) ?? [];

    // 1) parcela de uma compra que a equipe já descreveu (mesmo valor e mesmo nº de parcelas, parcela anterior)
    if (parcelaTotal && parcelaTotal > 1 && parcelaAtual) {
      const anteriores = historico.filter(
        (h) =>
          h.parcela_total === parcelaTotal &&
          (h.parcela_atual ?? 0) < parcelaAtual &&
          Math.abs(h.valor - valor) <= 0.05 &&
          h.descricao &&
          !SEM_INFO.test(h.descricao)
      );
      if (anteriores.length) {
        // a parcela imediatamente anterior é a mais confiável
        const melhor = anteriores.sort((a, b) => (b.parcela_atual ?? 0) - (a.parcela_atual ?? 0))[0];
        return {
          estabelecimento: melhor.estabelecimento,
          descricao: melhor.descricao,
          conta: melhor.conta_contabil,
          fonte: 'parcela',
        };
      }
    }

    // 2) estabelecimento conhecido
    const ks = chaves(descricaoFatura);
    const iguais = ks.flatMap((k) => this.porChave.get(k) ?? []);
    if (iguais.length) {
      const daEmpresa = iguais.filter((h) => normalizarEmpresa(h.empresa) === normalizarEmpresa(empresa));
      const base = (daEmpresa.length ? daEmpresa : iguais).slice(0, 12); // as mais recentes
      return {
        estabelecimento: base[0].estabelecimento,
        descricao: maioria(
          base.slice(0, 5).map((h) => h.descricao),
          0.8
        ),
        conta: maioria(base.map((h) => h.conta_contabil)),
        fonte: 'estabelecimento',
      };
    }
    return { estabelecimento: null, descricao: null, conta: null, fonte: null };
  }
}

/** Carrega a memória do banco (vazia se a tabela ainda não existir). */
export async function carregarMemoria(service: SupabaseClient): Promise<MemoriaCartoes> {
  try {
    const linhas = await buscarTodas<Classificacao>((de, ate) =>
      service
        .from('cartao_classificacoes')
        .select('empresa, vencimento, valor, parcela_atual, parcela_total, estabelecimento, descricao, conta_contabil')
        .order('id')
        .range(de, ate)
    );
    return new MemoriaCartoes(linhas.map((l) => ({ ...l, valor: Number(l.valor) })));
  } catch {
    return new MemoriaCartoes([]);
  }
}
