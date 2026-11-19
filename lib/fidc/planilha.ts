import { normalizarNome, pareceNome } from './nomes';

/**
 * Lê a planilha "operações - atual.xlsx" do financeiro: uma aba por dia de
 * operação (nome "dd.mm.aaaa"), com a tabela "FIDC/ EMPRESA | Valor da operação |
 * VALOR/ bruto | Recompras | Desconto | Despesas | VALOR/liquido" e, embaixo, o
 * bloco FATURAMENTO (de que dias de faturamento vieram os títulos).
 *
 * A ordem das colunas muda ao longo dos anos e às vezes aparecem colunas extras
 * (Prorrogação, Refaturamento, Nota de Troca, Substituição), então cada coluna é
 * achada pelo nome do cabeçalho.
 *
 * Trabalha sobre uma "grade" (linhas × colunas de valores simples), para não
 * depender da biblioteca de Excel.
 */

export type Valor = string | number | Date | null;
export type Grade = Valor[][];

export interface OperacaoLida {
  data: string; // aaaa-mm-dd
  aba: string;
  ordem: number;
  nome_original: string;
  fidc: string;
  empresa: string;
  valor_operacao: number;
  bruto: number;
  recompras: number;
  refaturamento: number;
  nota_troca: number;
  substituicao: number;
  prorrogacao: number;
  desconto: number;
  despesas: number;
  liquido: number;
}

export interface FaturamentoLido {
  data_operacao: string;
  aba: string;
  ordem: number;
  data_faturamento: string | null;
  valor: number;
}

export interface PlanilhaFidc {
  operacoes: OperacaoLida[];
  faturamentos: FaturamentoLido[];
  avisos: string[];
  abasLidas: number;
  abasIgnoradas: string[];
}

type Campo = keyof Pick<
  OperacaoLida,
  | 'valor_operacao'
  | 'bruto'
  | 'recompras'
  | 'refaturamento'
  | 'nota_troca'
  | 'substituicao'
  | 'prorrogacao'
  | 'desconto'
  | 'despesas'
  | 'liquido'
>;

const semAcento = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().replace(/\s+/g, ' ').trim();
const iso = (a: number, m: number, d: number) =>
  `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

function dataValida(a: number, m: number, d: number) {
  if (a < 100) a += 2000;
  if (a < 2015 || a > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  // 31/06 não existe: confere no calendário
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return iso(a, m, d);
}

/** Cabeçalho → campo. "Recompras/Refat." conta como recompra; "Prorroação" (sic) é prorrogação. */
function campoDoCabecalho(texto: string): Campo | null {
  const t = semAcento(texto).replace(/[^A-Z]/g, '');
  if (!t) return null;
  if (t.startsWith('VALORDAOPERACAO')) return 'valor_operacao';
  if (t.includes('BRUTO')) return 'bruto';
  if (t.includes('LIQUIDO')) return 'liquido';
  if (t.startsWith('RECOMPRA')) return 'recompras';
  if (t.startsWith('REFATURAMENTO')) return 'refaturamento';
  if (t.includes('NOTADETROCA')) return 'nota_troca';
  if (t.startsWith('SUBSTITUICAO')) return 'substituicao';
  if (t.startsWith('PRORRO')) return 'prorrogacao';
  if (t.startsWith('DESCONTO')) return 'desconto';
  if (t.startsWith('DESPESA')) return 'despesas';
  return null;
}

function numero(v: Valor): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v !== 'string') return 0;
  let s = v.replace(/R\$|\s/g, '').trim();
  if (!s || s === '-') return 0;
  const negativo = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[()-]/g, '');
  // "1.234,56" (BR) ou "1,234.56" (US): o último separador é o decimal
  const ultVirg = s.lastIndexOf(',');
  const ultPonto = s.lastIndexOf('.');
  if (ultVirg > ultPonto) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? (negativo ? -n : n) : 0;
}

function texto(v: Valor): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

/** Data de uma célula de faturamento: Date, número de série do Excel ou texto "11/13/26" / "13/11/2026". */
function dataDaCelula(v: Valor, dataOperacao: string): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 30000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return d.toISOString().slice(0, 10);
  }
  if (typeof v === 'string') {
    // aceita também a barra esquecida: "08/052023"
    const m = v.trim().match(/^(\d{1,2})[/.](\d{1,2})[/.]?(\d{2}|\d{4})$/);
    if (!m) return null;
    const a = +m[1], b = +m[2], ano = +m[3];
    // texto do Excel em inglês vem como mês/dia; escolhe a leitura que fica antes (e mais perto) da operação
    const opcoes = [dataValida(ano, b, a), dataValida(ano, a, b)].filter((x): x is string => Boolean(x));
    const antes = opcoes.filter((x) => x <= dataOperacao).sort().reverse();
    return antes[0] ?? opcoes[0] ?? null;
  }
  return null;
}

/** Data pelo nome da aba ("16.11.2026", "10.022023", "31..07.2024", "01102025"). */
function dataDaAba(nome: string): string | null {
  const m = nome.match(/^(\d{1,2})\.+(\d{1,2})\.*(\d{4})$/) ?? nome.match(/^(\d{2})(\d{2})(\d{4})$/);
  return m ? dataValida(+m[3], +m[2], +m[1]) : null;
}

/** Data do título "OPERAÇÃO 17/11/2026" (ou "OPERAÇÃO 10.01.2025"). */
function dataDoTitulo(linhas: Grade, ate: number): string | null {
  for (const l of linhas.slice(0, ate + 1)) {
    for (const c of l) {
      const m = texto(c).match(/OPERA\S*\s+(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/i);
      if (m) return dataValida(+m[3], +m[2], +m[1]);
    }
  }
  return null;
}

export function lerPlanilhaFidc(abas: { nome: string; grade: Grade }[]): PlanilhaFidc {
  const operacoes: OperacaoLida[] = [];
  const faturamentos: FaturamentoLido[] = [];
  const avisos: string[] = [];
  const abasIgnoradas: string[] = [];
  const naoReconhecidos = new Set<string>();
  let abasLidas = 0;
  let ultimaData: string | null = null;
  const distancia = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b));

  for (const { nome, grade } of abas) {
    const aba = nome.trim();
    if (semAcento(aba) === 'DIARIAS') continue; // resumo antigo (só jan/2023)

    // cabeçalho: linha com "FIDC"; se não tiver, a linha que tem "liquido" (aba de 10.01.2025)
    let ih = grade.findIndex((l) => l.some((c) => /FIDC/i.test(texto(c))));
    const semCabecalhoFidc = ih < 0;
    if (ih < 0) ih = grade.findIndex((l) => l.some((c) => campoDoCabecalho(texto(c)) === 'liquido'));
    if (ih < 0) {
      if (grade.some((l) => l.some((c) => c != null && texto(c) !== ''))) abasIgnoradas.push(aba);
      continue;
    }

    const titulo = dataDoTitulo(grade, ih);
    const pelaAba = dataDaAba(aba);
    let data = pelaAba ?? titulo;
    if (!data) {
      abasIgnoradas.push(aba);
      avisos.push(`Aba "${aba}": não achei a data da operação (nem no nome da aba, nem no título). Ficou de fora.`);
      continue;
    }
    if (pelaAba && titulo && pelaAba !== titulo) {
      // nome da aba e título não batem: fica a data que segue a sequência (a mais perto da aba anterior, sem voltar no tempo)
      const depois = [pelaAba, titulo].filter((d) => !ultimaData || d >= ultimaData);
      const candidatas = depois.length ? depois : [pelaAba, titulo];
      data = ultimaData
        ? candidatas.sort((a, b) => distancia(a, ultimaData!) - distancia(b, ultimaData!))[0]
        : pelaAba;
      avisos.push(`Aba "${aba}": o nome da aba diz ${br(pelaAba)} e o título diz ${br(titulo)}. Usei ${br(data)}.`);
    }
    ultimaData = data;

    const cab = grade[ih];
    const colunas = new Map<number, Campo>();
    cab.forEach((c, i) => {
      const campo = campoDoCabecalho(texto(c));
      if (campo && ![...colunas.values()].includes(campo)) colunas.set(i, campo);
    });

    let colNome = cab.findIndex((c) => /FIDC/i.test(texto(c)));
    if (semCabecalhoFidc) {
      // nome = primeira coluna com texto na linha seguinte; as duas primeiras colunas de número sem título são operação e bruto
      const prox = grade[ih + 1] ?? [];
      colNome = prox.findIndex((c) => typeof c === 'string' && pareceNome(c));
      const livres = prox
        .map((c, i) => (typeof c === 'number' && !colunas.has(i) ? i : -1))
        .filter((i) => i >= 0);
      if (livres[0] != null) colunas.set(livres[0], 'valor_operacao');
      if (livres[1] != null) colunas.set(livres[1], 'bruto');
    }
    if (colNome < 0) {
      abasIgnoradas.push(aba);
      continue;
    }

    abasLidas++;
    let ordem = 0;
    let i = ih + 1;
    for (; i < grade.length; i++) {
      const l = grade[i];
      const nomeCel = texto(l[colNome] ?? null);
      if (/FATURAMENTO/i.test(nomeCel) || l.some((c) => /^FATURAMENTO$/i.test(texto(c)))) break;
      if (!nomeCel) {
        // linha de total (sem nome): fim da tabela, se já tiver lido alguma operação
        if (ordem > 0 && l.some((c) => typeof c === 'number' || /\d/.test(texto(c)))) {
          i++;
          break;
        }
        continue;
      }
      if (!pareceNome(nomeCel)) continue;

      const op: OperacaoLida = {
        data,
        aba,
        ordem: ++ordem,
        nome_original: nomeCel,
        ...(() => {
          const n = normalizarNome(nomeCel);
          if (!n.reconhecido) naoReconhecidos.add(nomeCel);
          return { fidc: n.fidc, empresa: n.empresa };
        })(),
        valor_operacao: 0,
        bruto: 0,
        recompras: 0,
        refaturamento: 0,
        nota_troca: 0,
        substituicao: 0,
        prorrogacao: 0,
        desconto: 0,
        despesas: 0,
        liquido: 0,
      };
      for (const [col, campo] of colunas) op[campo] = Math.round(numero(l[col] ?? null) * 100) / 100;
      if (!op.bruto) op.bruto = op.valor_operacao;
      if (!op.valor_operacao && !op.bruto && !op.liquido) continue; // linha vazia de verdade
      operacoes.push(op);
    }

    // bloco FATURAMENTO: data do faturamento | valor
    const iFat = grade.findIndex((l, k) => k >= ih && l.some((c) => /^FATURAMENTO$/i.test(texto(c))));
    if (iFat >= 0) {
      const colData = grade[iFat].findIndex((c) => /^FATURAMENTO$/i.test(texto(c)));
      const colValor = grade[iFat].findIndex((c, k) => k > colData && /^VALOR/i.test(texto(c)));
      let ordemFat = 0;
      for (let k = iFat + 1; k < grade.length; k++) {
        const l = grade[k];
        const cData = l[colData] ?? null;
        if (cData == null || texto(cData) === '') break; // total
        const valor = numero(l[colValor >= 0 ? colValor : colData + 2] ?? null);
        if (!valor) continue;
        faturamentos.push({
          data_operacao: data,
          aba,
          ordem: ++ordemFat,
          data_faturamento: dataDaCelula(cData, data),
          valor: Math.round(valor * 100) / 100,
        });
      }
    }
  }

  if (naoReconhecidos.size) {
    avisos.push(
      `FIDC não reconhecida (entrou com o nome como está na planilha): ${[...naoReconhecidos].slice(0, 15).join(', ')}${naoReconhecidos.size > 15 ? '…' : ''}`
    );
  }
  return { operacoes, faturamentos, avisos, abasLidas, abasIgnoradas };
}
