import type { Conciliado, ExtratoLido, ItemPlanilha, LancamentoBanco, PlanilhaLida, ResultadoConciliacao } from './tipos';
import { juntarLancamentos } from './extratoBanco';

/**
 * Concilia os repasses da planilha com os créditos dos extratos.
 *
 * - Casa pelo valor exato (centavo) e pela data mais próxima: com a data do
 *   marketplace, o crédito tem que cair entre 3 dias antes e 10 dias depois;
 *   sem data, vale qualquer crédito do período (com folga de 3 dias).
 * - Período do mês: do dia 1º até o primeiro dia útil do mês seguinte. O que
 *   cai no banco do dia 1º até esse primeiro dia útil (ex.: 01 a 03/11/2026,
 *   com domingo e o feriado de Finados) entra no último dia útil do mês.
 * - Cada crédito do banco só pode ser usado uma vez.
 */

const DIA = 86_400_000;
const dias = (a: string, b: string) => (Date.parse(a) - Date.parse(b)) / DIA;
const somarDias = (d: string, n: number) => new Date(Date.parse(d) + n * DIA).toISOString().slice(0, 10);
const centavos = (v: number) => Math.round(v * 100);

/** domingo de Páscoa (algoritmo de Meeus/Jones/Butcher) */
function pascoa(ano: number) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** feriados nacionais em que o banco não credita (inclui Carnaval e Corpus Christi) */
function feriados(ano: number): Set<string> {
  const p = pascoa(ano);
  const fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'].map((d) => `${ano}-${d}`);
  return new Set([...fixos, ...[-48, -47, -2, 60].map((n) => somarDias(p, n))]);
}

const diaUtil = (d: string) => ![0, 6].includes(new Date(d).getUTCDay()) && !feriados(Number(d.slice(0, 4))).has(d);

export function periodoDoMes(mes: string) {
  const [a, m] = mes.split('-').map(Number);
  const inicio = `${mes}-01`;
  const primeiroSeguinte = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10);
  // primeiro dia útil do mês seguinte (incluído no período)
  let fim = primeiroSeguinte;
  while (!diaUtil(fim)) fim = somarDias(fim, 1);
  // último dia útil do mês
  let ultimoUtil = somarDias(primeiroSeguinte, -1);
  while (!diaUtil(ultimoUtil)) ultimoUtil = somarDias(ultimoUtil, -1);
  return { inicio, fim, primeiroSeguinte, ultimoUtil };
}

/** marca que identifica quem pagou: CPF/CNPJ ou o nome da maquininha ("AMAZON-VISA" → "AMAZON") */
function origem(l: LancamentoBanco): string | null {
  if (l.documento) return l.documento;
  const cartao = l.historico.match(/Pagamento Cartao De (?:Credito|Debito)\s+(.+?)-[A-Z ]+\s+\d+/i);
  return cartao ? cartao[1].trim().toUpperCase() : null;
}

export function conciliar(mes: string, extratos: ExtratoLido[], planilha: PlanilhaLida): ResultadoConciliacao {
  const { inicio, fim, primeiroSeguinte, ultimoUtil } = periodoDoMes(mes);
  const creditos = juntarLancamentos(extratos).filter((l) => l.valor > 0);
  const usados = new Set<number>();

  const janela = (item: ItemPlanilha, l: LancamentoBanco) => {
    if (item.data) {
      const d = dias(l.data, item.data);
      return d >= -3 && d <= 10;
    }
    return dias(l.data, inicio) >= -3 && dias(l.data, fim) <= 3;
  };
  const distancia = (item: ItemPlanilha, l: LancamentoBanco) =>
    item.data ? Math.abs(dias(l.data, item.data)) : l.data >= inicio && l.data <= fim ? 0 : 99;

  // primeiro os itens com data (mais seguros), depois os sem data
  const ordem = [...planilha.itens].sort((a, b) => Number(!a.data) - Number(!b.data));
  const casados = new Map<number, LancamentoBanco>();
  for (const item of ordem) {
    const candidatos = creditos
      .filter((l) => !usados.has(l.id) && centavos(l.valor) === centavos(item.valor) && janela(item, l))
      .sort((a, b) => distancia(item, a) - distancia(item, b));
    if (candidatos[0]) {
      usados.add(candidatos[0].id);
      casados.set(item.id, candidatos[0]);
    }
  }

  // de quem cada canal recebe (para sugerir e para achar sobras no extrato)
  const origensDoCanal = new Map<string, Set<string>>();
  for (const item of planilha.itens) {
    const l = casados.get(item.id);
    const o = l && origem(l);
    if (!o) continue;
    if (!origensDoCanal.has(item.canal)) origensDoCanal.set(item.canal, new Set());
    origensDoCanal.get(item.canal)!.add(o);
  }

  const diaDoFluxo = (data: string) => {
    if (data >= primeiroSeguinte && data <= fim) return ultimoUtil;
    return data >= inicio && data < primeiroSeguinte ? data : null;
  };

  const conciliados: Conciliado[] = planilha.itens.map((item) => {
    const banco = casados.get(item.id) ?? null;
    let sugestoes: Conciliado['sugestoes'] = [];
    if (!banco) {
      const origens = origensDoCanal.get(item.canal);
      sugestoes = creditos
        .filter((l) => !usados.has(l.id) && janela(item, l))
        .map((l) => ({ banco: l, diferenca: Math.round((l.valor - item.valor) * 100) / 100 }))
        .filter(({ banco: l, diferenca }) => {
          const mesmaOrigem = origens?.has(origem(l) ?? '');
          // mesma origem do canal com valor próximo, ou qualquer crédito com diferença de até 1%
          return (mesmaOrigem && Math.abs(diferenca) <= item.valor * 0.2) || Math.abs(diferenca) <= Math.max(1, item.valor * 0.01);
        })
        .sort((a, b) => Math.abs(a.diferenca) - Math.abs(b.diferenca))
        .slice(0, 3);
    }
    return { item, banco, diaFluxo: banco ? diaDoFluxo(banco.data) : null, sugestoes };
  });

  // créditos do período que vieram de quem paga os marketplaces mas não estão na planilha
  const canaisDaOrigem = new Map<string, string[]>();
  origensDoCanal.forEach((origens, canal) =>
    origens.forEach((o) => canaisDaOrigem.set(o, [...(canaisDaOrigem.get(o) ?? []), canal]))
  );
  const sobrasExtrato = creditos
    .filter((l) => !usados.has(l.id) && l.data >= inicio && l.data <= fim && canaisDaOrigem.has(origem(l) ?? ''))
    .map((l) => ({ banco: l, provavelCanal: canaisDaOrigem.get(origem(l)!)!.join(' / ') }))
    .sort((a, b) => a.banco.data.localeCompare(b.banco.data));

  const mapaDia = new Map<string, { valor: number; itens: number }>();
  for (const c of conciliados) {
    if (!c.diaFluxo) continue;
    const d = mapaDia.get(c.diaFluxo) ?? { valor: 0, itens: 0 };
    d.valor += c.item.valor;
    d.itens++;
    mapaDia.set(c.diaFluxo, d);
  }
  const porDia = Array.from(mapaDia, ([dia, d]) => ({ dia, valor: Math.round(d.valor * 100) / 100, itens: d.itens })).sort(
    (a, b) => a.dia.localeCompare(b.dia)
  );

  const soma = (lista: Conciliado[]) => Math.round(lista.reduce((s, c) => s + c.item.valor, 0) * 100) / 100;
  return {
    mes,
    inicio,
    fim,
    extratos: extratos.map((e) => ({
      arquivo: e.arquivo,
      banco: e.banco,
      empresa: e.empresa,
      conta: e.conta,
      periodo: e.periodo,
      lancamentos: e.lancamentos.length,
    })),
    planilha: { arquivo: planilha.arquivo, totalConsolidado: planilha.totalConsolidado, avisos: planilha.avisos },
    conciliados,
    sobrasExtrato,
    porDia,
    totais: {
      planilha: soma(conciliados),
      conciliado: soma(conciliados.filter((c) => c.banco)),
      naoEncontrado: soma(conciliados.filter((c) => !c.banco)),
      foraDoPeriodo: soma(conciliados.filter((c) => c.banco && !c.diaFluxo)),
    },
  };
}
