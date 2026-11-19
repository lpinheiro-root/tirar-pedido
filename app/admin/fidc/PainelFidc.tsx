'use client';

import { Fragment, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export interface Operacao {
  id: number;
  data: string;
  aba: string;
  nome_original: string;
  fidc: string;
  empresa: string;
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

export interface Importacao {
  criado_em: string;
  usuario_nome: string | null;
  arquivo: string | null;
  dias: number;
  operacoes: number;
  primeira_data: string | null;
  ultima_data: string | null;
}

interface RespostaImportacao {
  dias: number;
  operacoes: number;
  faturamentos: number;
  primeira: string;
  ultima: string;
  avisos: string[];
  abasIgnoradas: string[];
}

type Periodo = 'mes' | 'mes_passado' | '3m' | '12m' | 'ano' | 'ano_passado' | 'tudo' | 'livre';

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const curta = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e6) return `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`;
  if (a >= 1e3) return `R$ ${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  return moeda(v);
};
const pct = (v: number) => `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const br = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—');
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const nomeMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);

function intervalo(p: Periodo, de: string, ate: string): [string, string] {
  const hoje = new Date();
  const a = hoje.getFullYear();
  const m = hoje.getMonth();
  switch (p) {
    case 'mes':
      return [iso(new Date(Date.UTC(a, m, 1))), iso(new Date(Date.UTC(a, m + 1, 0)))];
    case 'mes_passado':
      return [iso(new Date(Date.UTC(a, m - 1, 1))), iso(new Date(Date.UTC(a, m, 0)))];
    case '3m':
      return [iso(new Date(Date.UTC(a, m - 2, 1))), iso(new Date(Date.UTC(a, m + 1, 0)))];
    case '12m':
      return [iso(new Date(Date.UTC(a, m - 11, 1))), iso(new Date(Date.UTC(a, m + 1, 0)))];
    case 'ano':
      return [`${a}-01-01`, `${a}-12-31`];
    case 'ano_passado':
      return [`${a - 1}-01-01`, `${a - 1}-12-31`];
    case 'tudo':
      return ['0000-01-01', '9999-12-31'];
    default:
      return [de || '0000-01-01', ate || '9999-12-31'];
  }
}

interface Soma {
  bruto: number;
  recompras: number;
  desconto: number;
  despesas: number;
  outros: number;
  liquido: number;
  qtd: number;
}
const vazia = (): Soma => ({ bruto: 0, recompras: 0, desconto: 0, despesas: 0, outros: 0, liquido: 0, qtd: 0 });
function somar(s: Soma, o: Operacao) {
  s.bruto += o.bruto;
  s.recompras += o.recompras;
  s.desconto += o.desconto;
  s.despesas += o.despesas;
  s.outros += o.refaturamento + o.nota_troca + o.substituicao + o.prorrogacao;
  s.liquido += o.liquido;
  s.qtd++;
  return s;
}
function agrupar(ops: Operacao[], chave: (o: Operacao) => string) {
  const m = new Map<string, Soma>();
  for (const o of ops) somar(m.get(chave(o)) ?? m.set(chave(o), vazia()).get(chave(o))!, o);
  return m;
}

const seletor =
  'h-9 rounded-md border border-[#D1D5DB] bg-surface-container-lowest px-2 text-body-sm text-on-surface';
const campoArquivo =
  'block w-full text-body-sm text-on-surface file:mr-3 file:h-9 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:text-body-sm file:font-medium file:text-primary hover:file:bg-primary/15';

function Barra({ valor, max, cor = 'bg-primary' }: { valor: number; max: number; cor?: string }) {
  const w = max > 0 ? Math.max(1, Math.round((valor / max) * 100)) : 0;
  return (
    <div className="h-2 w-full rounded-full bg-surface-container">
      <div className={`h-2 rounded-full ${cor}`} style={{ width: `${w}%` }} />
    </div>
  );
}

/** Detalhe que abre embaixo da linha do ranking: números do item, quebra pela outra dimensão, mês a mês e últimas operações. */
function Detalhe({
  ops,
  s,
  outraChave,
  outroRotulo,
  filtrado,
  onFiltrar,
}: {
  ops: Operacao[];
  s: Soma;
  outraChave: (o: Operacao) => string;
  outroRotulo: string;
  filtrado: boolean;
  onFiltrar: () => void;
}) {
  const porOutra = [...agrupar(ops, outraChave).entries()].sort((a, b) => b[1].bruto - a[1].bruto);
  const meses = [...agrupar(ops, (o) => o.data.slice(0, 7)).entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);
  const maxMes = Math.max(0, ...meses.map(([, m]) => m.bruto));
  const datas = ops.map((o) => o.data).sort();
  const nDias = new Set(datas).size;
  const ultimas = [...ops].sort((a, b) => b.data.localeCompare(a.data) || a.id - b.id).slice(0, 8);
  const custos = ops.filter((o) => o.bruto > 0).map((o) => o.despesas / o.bruto);

  const numeros = [
    ['Operações', `${s.qtd} em ${nDias} dias`],
    ['Primeira / última', `${br(datas[0])} · ${br(datas[datas.length - 1])}`],
    ['Antecipado', moeda(s.bruto)],
    ['Média por operação', s.qtd ? moeda(s.bruto / s.qtd) : '—'],
    ['Recompras', s.recompras ? `${moeda(s.recompras)} (${pct(s.recompras / s.bruto)})` : '—'],
    ['Desconto', s.desconto + s.outros ? moeda(s.desconto + s.outros) : '—'],
    ['Custo (despesas)', `${moeda(s.despesas)} (${s.bruto ? pct(s.despesas / s.bruto) : '—'})`],
    ['Custo menor / maior', custos.length ? `${pct(Math.min(...custos))} · ${pct(Math.max(...custos))}` : '—'],
    ['Líquido recebido', moeda(s.liquido)],
  ];

  return (
    <div className="space-y-4 bg-surface-container-low px-4 py-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
        {numeros.map(([t, v]) => (
          <div key={t}>
            <p className="text-label uppercase text-on-surface-variant">{t}</p>
            <p className="tabular-nums text-on-surface">{v}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-1 text-label font-medium uppercase text-on-surface-variant">Por {outroRotulo}</p>
          <table className="w-full text-body-sm">
            <tbody>
              {porOutra.map(([nome, o]) => (
                <tr key={nome} className="border-t border-border-muted">
                  <td className="py-1 pr-2 text-on-surface">{nome}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{curta(o.bruto)}</td>
                  <td className="py-1 text-right tabular-nums text-on-surface-variant">{o.bruto ? pct(o.despesas / o.bruto) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <p className="mb-1 text-label font-medium uppercase text-on-surface-variant">Últimos meses</p>
          <table className="w-full text-body-sm">
            <tbody>
              {meses.map(([mes, m]) => (
                <tr key={mes} className="border-t border-border-muted">
                  <td className="w-14 py-1 pr-2 capitalize text-on-surface">{nomeMes(mes)}</td>
                  <td className="py-1 pr-2">
                    <Barra valor={m.bruto} max={maxMes} />
                  </td>
                  <td className="w-24 py-1 pr-2 text-right tabular-nums">{curta(m.bruto)}</td>
                  <td className="w-16 py-1 text-right tabular-nums text-on-surface-variant">{m.bruto ? pct(m.despesas / m.bruto) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <p className="mb-1 text-label font-medium uppercase text-on-surface-variant">Últimas operações</p>
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="text-left text-label text-on-surface-variant">
                <th className="py-1 pr-2 font-medium">Dia</th>
                <th className="py-1 pr-2 font-medium">Na planilha</th>
                <th className="py-1 pr-2 text-right font-medium">Bruto</th>
                <th className="py-1 pr-2 text-right font-medium">Recompra</th>
                <th className="py-1 pr-2 text-right font-medium">Custo</th>
                <th className="py-1 text-right font-medium">Líquido</th>
              </tr>
            </thead>
            <tbody>
              {ultimas.map((o) => (
                <tr key={o.id} className="border-t border-border-muted">
                  <td className="py-1 pr-2">{br(o.data)}</td>
                  <td className="py-1 pr-2 text-on-surface-variant">{o.nome_original}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{moeda(o.bruto)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{o.recompras ? moeda(o.recompras) : '—'}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {moeda(o.despesas)}
                    {o.bruto ? <span className="ml-1 text-label text-on-surface-variant">({pct(o.despesas / o.bruto)})</span> : null}
                  </td>
                  <td className="py-1 text-right tabular-nums">{moeda(o.liquido)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Button type="button" variant="secondary" size="sm" onClick={onFiltrar}>
        {filtrado ? 'Tirar o filtro do painel' : 'Filtrar o painel inteiro por este'}
      </Button>
    </div>
  );
}

type Ordem = 'bruto' | 'custo_pct' | 'custo' | 'recompras' | 'liquido' | 'qtd';
const custoPct = (s: Soma) => (s.bruto ? s.despesas / s.bruto : Infinity);
const ORDENS: { id: Ordem; rotulo: string; comparar: (a: Soma, b: Soma) => number }[] = [
  { id: 'bruto', rotulo: 'Mais antecipado', comparar: (a, b) => b.bruto - a.bruto },
  { id: 'custo_pct', rotulo: 'Custo % mais barato', comparar: (a, b) => custoPct(a) - custoPct(b) || b.bruto - a.bruto },
  { id: 'custo', rotulo: 'Maior custo em R$', comparar: (a, b) => b.despesas - a.despesas },
  { id: 'recompras', rotulo: 'Mais recompras', comparar: (a, b) => b.recompras - a.recompras || b.bruto - a.bruto },
  { id: 'liquido', rotulo: 'Mais líquido', comparar: (a, b) => b.liquido - a.liquido },
  { id: 'qtd', rotulo: 'Mais operações', comparar: (a, b) => b.qtd - a.qtd || b.bruto - a.bruto },
];

function Ranking({
  titulo,
  ops,
  chave,
  outraChave,
  outroRotulo,
  selecionado,
  onEscolher,
}: {
  titulo: string;
  ops: Operacao[];
  chave: (o: Operacao) => string;
  outraChave: (o: Operacao) => string;
  outroRotulo: string;
  selecionado: string;
  onEscolher: (nome: string) => void;
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  const [ordem, setOrdem] = useState<Ordem>('bruto');
  const grupos = useMemo(() => agrupar(ops, chave), [ops, chave]);
  const criterio = ORDENS.find((o) => o.id === ordem)!;
  const linhas = [...grupos.entries()].sort((a, b) => criterio.comparar(a[1], b[1]));
  const max = Math.max(0, ...linhas.map(([, s]) => s.bruto));
  // participação sobre o total do próprio ranking (antes dava 121% com outro filtro ligado)
  const total = linhas.reduce((t, [, s]) => t + s.bruto, 0);
  return (
    <Card>
      <div className="border-b border-border-muted px-4 py-3">
        <p className="text-h2 text-on-surface">{titulo}</p>
        <p className="text-label text-on-surface-variant">Escolha a ordem do ranking. Clique numa linha para ver os detalhes.</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ORDENS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setOrdem(o.id)}
              className={`rounded-full border px-3 py-1 text-label font-medium transition-colors ${
                ordem === o.id
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-border-muted text-on-surface-variant hover:border-primary hover:text-primary'
              }`}
            >
              {o.rotulo}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-body-sm">
          <thead>
            <tr className="text-left text-label uppercase text-on-surface-variant">
              <th className="w-10 py-2 pl-4 text-center font-medium">#</th>
              <th className="px-4 py-2 font-medium">Nome</th>
              <th className="px-4 py-2 text-right font-medium">Antecipado</th>
              <th className="w-28 px-4 py-2 font-medium">Participação</th>
              <th className="px-4 py-2 text-right font-medium">Custo</th>
              <th className="px-4 py-2 text-right font-medium">Custo %</th>
              <th className="px-4 py-2 text-right font-medium">Líquido</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(([nome, s], i) => (
              <Fragment key={nome}>
              <tr
                onClick={() => setAberto(aberto === nome ? null : nome)}
                className={`cursor-pointer border-t border-border-muted hover:bg-primary/5 ${aberto === nome || selecionado === nome ? 'bg-primary/10' : ''}`}
              >
                <td className="py-2 pl-4 text-center">
                  <span
                    className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-label font-semibold tabular-nums ${
                      i === 0
                        ? 'bg-amber-400 text-white'
                        : i === 1
                          ? 'bg-slate-400 text-white'
                          : i === 2
                            ? 'bg-orange-700/80 text-white'
                            : 'text-on-surface-variant'
                    }`}
                  >
                    {i + 1}º
                  </span>
                </td>
                <td className="px-4 py-2 font-medium text-on-surface">
                  <span className="mr-1 inline-block w-3 text-on-surface-variant">{aberto === nome ? '▾' : '▸'}</span>
                  {nome}
                  <span className="ml-1 text-label text-on-surface-variant">({s.qtd})</span>
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{curta(s.bruto)}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <Barra valor={s.bruto} max={max} />
                    <span className="w-10 text-right text-label tabular-nums text-on-surface-variant">
                      {total ? Math.round((s.bruto / total) * 100) : 0}%
                    </span>
                  </div>
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{curta(s.despesas)}</td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">{s.bruto ? pct(s.despesas / s.bruto) : '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{curta(s.liquido)}</td>
              </tr>
              {aberto === nome && (
                <tr>
                  <td colSpan={7} className="border-t border-border-muted p-0">
                    <Detalhe
                      ops={ops.filter((o) => chave(o) === nome)}
                      s={s}
                      outraChave={outraChave}
                      outroRotulo={outroRotulo}
                      filtrado={selecionado === nome}
                      onFiltrar={() => onEscolher(selecionado === nome ? '' : nome)}
                    />
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

type Metrica = 'bruto' | 'despesas' | 'custo_pct' | 'liquido' | 'recompras';
const METRICAS: { id: Metrica; rotulo: string }[] = [
  { id: 'bruto', rotulo: 'Antecipado' },
  { id: 'despesas', rotulo: 'Custo R$' },
  { id: 'custo_pct', rotulo: 'Custo %' },
  { id: 'recompras', rotulo: 'Recompras' },
  { id: 'liquido', rotulo: 'Líquido' },
];
function valorMetrica(s: Soma | undefined, m: Metrica): string {
  if (!s || !s.qtd) return '';
  if (m === 'custo_pct') return s.bruto ? pct(s.despesas / s.bruto) : '—';
  const v = s[m];
  return v ? curta(v) : '—';
}

/** Tabela FIDC × mês: cada FIDC numa linha, cada mês numa coluna (mais recente primeiro). */
function FidcPorMes({ ops }: { ops: Operacao[] }) {
  const [metrica, setMetrica] = useState<Metrica>('bruto');
  const meses = useMemo(() => [...new Set(ops.map((o) => o.data.slice(0, 7)))].sort().reverse(), [ops]);
  const celulas = useMemo(() => agrupar(ops, (o) => `${o.fidc}|${o.data.slice(0, 7)}`), [ops]);
  const porFidc = useMemo(() => agrupar(ops, (o) => o.fidc), [ops]);
  const porMes = useMemo(() => agrupar(ops, (o) => o.data.slice(0, 7)), [ops]);
  const total = useMemo(() => ops.reduce(somar, vazia()), [ops]);
  const fidcs = [...porFidc.entries()].sort((a, b) => b[1].bruto - a[1].bruto).map(([f]) => f);

  // intensidade da cor da célula, para bater o olho em quem pesou mais no mês
  const maxCelula = Math.max(0, ...[...celulas.values()].map((s) => s.bruto));
  const fundo = (s: Soma | undefined) => {
    if (!s || metrica !== 'bruto' || !maxCelula) return undefined;
    return { backgroundColor: `rgba(37, 99, 235,${(0.04 + (s.bruto / maxCelula) * 0.22).toFixed(3)})` };
  };

  return (
    <Card>
      <div className="border-b border-border-muted px-4 py-3">
        <p className="text-h2 text-on-surface">FIDC por mês</p>
        <p className="text-label text-on-surface-variant">Cada FIDC numa linha e cada mês numa coluna. Role para o lado para ver os meses mais antigos.</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {METRICAS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMetrica(m.id)}
              className={`rounded-full border px-3 py-1 text-label font-medium transition-colors ${
                metrica === m.id
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-border-muted text-on-surface-variant hover:border-primary hover:text-primary'
              }`}
            >
              {m.rotulo}
            </button>
          ))}
        </div>
      </div>
      <div className="max-h-[560px] overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-body-sm">
          <thead>
            <tr className="text-label uppercase text-on-surface-variant">
              <th className="sticky left-0 top-0 z-20 border-b border-border-muted bg-surface-container-lowest px-4 py-2 text-left font-medium">
                FIDC
              </th>
              <th className="sticky top-0 z-10 border-b border-l border-border-muted bg-surface-container-low px-3 py-2 text-right font-semibold text-on-surface">
                Total
              </th>
              {meses.map((m) => (
                <th
                  key={m}
                  className="sticky top-0 z-10 whitespace-nowrap border-b border-border-muted bg-surface-container-lowest px-3 py-2 text-right font-medium capitalize"
                >
                  {nomeMes(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fidcs.map((f) => (
              <tr key={f} className="hover:bg-primary/5">
                <td className="sticky left-0 z-10 whitespace-nowrap border-b border-border-muted bg-surface-container-lowest px-4 py-1.5 font-medium text-on-surface">
                  {f}
                </td>
                <td className="whitespace-nowrap border-b border-l border-border-muted bg-surface-container-low px-3 py-1.5 text-right font-semibold tabular-nums text-on-surface">
                  {valorMetrica(porFidc.get(f), metrica)}
                </td>
                {meses.map((m) => {
                  const s = celulas.get(`${f}|${m}`);
                  return (
                    <td
                      key={m}
                      style={fundo(s)}
                      title={s ? `${f} · ${nomeMes(m)}: ${moeda(s.bruto)} antecipado, custo ${moeda(s.despesas)} (${pct(s.despesas / (s.bruto || 1))}), ${s.qtd} operações` : undefined}
                      className="whitespace-nowrap border-b border-border-muted px-3 py-1.5 text-right tabular-nums text-on-surface"
                    >
                      {valorMetrica(s, metrica)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold text-on-surface">
              <td className="sticky bottom-0 left-0 z-20 border-t border-border-muted bg-surface-container-low px-4 py-2">Total</td>
              <td className="sticky bottom-0 z-10 whitespace-nowrap border-l border-t border-border-muted bg-surface-container-low px-3 py-2 text-right tabular-nums">
                {valorMetrica(total, metrica)}
              </td>
              {meses.map((m) => (
                <td
                  key={m}
                  className="sticky bottom-0 z-10 whitespace-nowrap border-t border-border-muted bg-surface-container-low px-3 py-2 text-right tabular-nums"
                >
                  {valorMetrica(porMes.get(m), metrica)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

const porFidcChave = (o: Operacao) => o.fidc;
const porEmpresaChave = (o: Operacao) => o.empresa;

function Importar({ ultima }: { ultima: Importacao | null }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [res, setRes] = useState<RespostaImportacao | null>(null);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    setRes(null);
    try {
      const r = await fetch('/api/fidc/importar', { method: 'POST', body: new FormData(e.currentTarget) });
      const json = await r.json().catch(() => ({ erro: 'Resposta inválida do servidor.' }));
      if (!r.ok || json.erro) setErro(json.erro ?? 'Não consegui importar.');
      else {
        setRes(json as RespostaImportacao);
        form.current?.reset();
        router.refresh();
      }
    } catch {
      setErro('Falha de conexão com o servidor.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-body-sm text-on-surface-variant">
          {ultima ? (
            <>
              Última importação: <strong className="text-on-surface">{new Date(ultima.criado_em).toLocaleString('pt-BR')}</strong>
              {ultima.usuario_nome ? ` por ${ultima.usuario_nome}` : ''} · dados até{' '}
              <strong className="text-on-surface">{br(ultima.ultima_data)}</strong>
            </>
          ) : (
            'Nenhuma planilha importada ainda.'
          )}
        </div>
        <Button type="button" variant={aberto ? 'ghost' : 'secondary'} size="sm" onClick={() => setAberto(!aberto)}>
          {aberto ? 'Fechar' : 'Importar planilha do dia'}
        </Button>
      </div>
      {aberto && (
        <form ref={form} onSubmit={enviar} className="mt-4 space-y-3 border-t border-border-muted pt-4">
          <div>
            <label className="mb-1 block text-label text-on-surface-variant">
              Planilha de operações (.xlsx). Pode ser a planilha inteira: os dias que vierem nela são atualizados, sem duplicar.
            </label>
            <input type="file" name="planilha" accept=".xlsx" required className={campoArquivo} />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={enviando}>
              {enviando ? 'Importando…' : 'Importar'}
            </Button>
            {erro && <p className="text-body-sm text-error">{erro}</p>}
          </div>
        </form>
      )}
      {res && (
        <div className="mt-4 space-y-1 rounded-md border border-green-200 bg-green-50 p-3 text-body-sm text-green-900">
          <p>
            ✅ Importado: {res.operacoes} operações em {res.dias} dias ({br(res.primeira)} a {br(res.ultima)}).
          </p>
          {res.avisos.length > 0 && (
            <details className="text-amber-900">
              <summary className="cursor-pointer">⚠️ {res.avisos.length} avisos para conferir na planilha</summary>
              <ul className="mt-1 list-disc pl-5">
                {res.avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </Card>
  );
}

export function PainelFidc({ operacoes, ultima }: { operacoes: Operacao[]; ultima: Importacao | null }) {
  const [periodo, setPeriodo] = useState<Periodo>('ano');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [fidc, setFidc] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [diasVisiveis, setDiasVisiveis] = useState(15);
  const [diaAberto, setDiaAberto] = useState<string | null>(null);

  const fidcs = useMemo(() => [...new Set(operacoes.map((o) => o.fidc))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [operacoes]);
  const empresas = useMemo(() => [...new Set(operacoes.map((o) => o.empresa))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [operacoes]);

  const [ini, fim] = intervalo(periodo, de, ate);
  const noPeriodo = useMemo(() => operacoes.filter((o) => o.data >= ini && o.data <= fim), [operacoes, ini, fim]);
  const filtradas = useMemo(
    () => noPeriodo.filter((o) => (!fidc || o.fidc === fidc) && (!empresa || o.empresa === empresa)),
    [noPeriodo, fidc, empresa]
  );

  const total = useMemo(() => filtradas.reduce(somar, vazia()), [filtradas]);
  const dias = useMemo(() => agrupar(filtradas, (o) => o.data), [filtradas]);
  // os rankings respeitam o outro filtro (por FIDC filtra empresa e vice-versa)
  const opsFidc = useMemo(() => noPeriodo.filter((o) => !empresa || o.empresa === empresa), [noPeriodo, empresa]);
  const opsEmpresa = useMemo(() => noPeriodo.filter((o) => !fidc || o.fidc === fidc), [noPeriodo, fidc]);
  const porMes = useMemo(
    () => [...agrupar(filtradas, (o) => o.data.slice(0, 7)).entries()].sort((a, b) => b[0].localeCompare(a[0])),
    [filtradas]
  );
  const maxMes = Math.max(0, ...porMes.map(([, s]) => s.bruto));
  const listaDias = [...dias.keys()].sort().reverse();

  const kpis = [
    { t: 'Antecipado (bruto)', v: curta(total.bruto), s: `${total.qtd} operações em ${dias.size} dias` },
    { t: 'Custo (despesas)', v: curta(total.despesas), s: total.bruto ? `${pct(total.despesas / total.bruto)} do antecipado` : '—', c: 'text-secondary' },
    { t: 'Recompras', v: curta(total.recompras), s: total.bruto ? `${pct(total.recompras / total.bruto)} do antecipado` : '—', c: total.recompras ? 'text-amber-700' : undefined },
    { t: 'Desconto', v: curta(total.desconto + total.outros), s: total.outros ? `inclui ${curta(total.outros)} de prorrog./refat./troca` : 'retido pelos FIDCs' },
    { t: 'Líquido recebido', v: curta(total.liquido), s: total.bruto ? `${pct(total.liquido / total.bruto)} do antecipado` : '—', c: 'text-green-700' },
    { t: 'Média por dia', v: dias.size ? curta(total.bruto / dias.size) : '—', s: 'antecipado por dia com operação' },
  ];

  return (
    <div className="space-y-6">
      <Importar ultima={ultima} />

      <Card className="flex flex-wrap items-end gap-4 p-4">
        <div>
          <label className="mb-1 block text-label text-on-surface-variant">Período</label>
          <select className={seletor} value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)}>
            <option value="mes">Este mês</option>
            <option value="mes_passado">Mês passado</option>
            <option value="3m">Últimos 3 meses</option>
            <option value="12m">Últimos 12 meses</option>
            <option value="ano">Este ano</option>
            <option value="ano_passado">Ano passado</option>
            <option value="tudo">Tudo (desde 2023)</option>
            <option value="livre">Escolher datas…</option>
          </select>
        </div>
        {periodo === 'livre' && (
          <>
            <div>
              <label className="mb-1 block text-label text-on-surface-variant">De</label>
              <input type="date" className={seletor} value={de} onChange={(e) => setDe(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-label text-on-surface-variant">Até</label>
              <input type="date" className={seletor} value={ate} onChange={(e) => setAte(e.target.value)} />
            </div>
          </>
        )}
        <div>
          <label className="mb-1 block text-label text-on-surface-variant">FIDC</label>
          <select className={seletor} value={fidc} onChange={(e) => setFidc(e.target.value)}>
            <option value="">Todas</option>
            {fidcs.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-label text-on-surface-variant">Empresa</label>
          <select className={seletor} value={empresa} onChange={(e) => setEmpresa(e.target.value)}>
            <option value="">Todas</option>
            {empresas.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </div>
        {(fidc || empresa) && (
          <Button type="button" variant="ghost" size="sm" onClick={() => { setFidc(''); setEmpresa(''); }}>
            Limpar filtros
          </Button>
        )}
      </Card>

      {!filtradas.length ? (
        <Card className="p-8 text-center text-body-sm text-on-surface-variant">
          {operacoes.length ? 'Nenhuma operação nesse período/filtro.' : 'Importe a planilha de operações para começar.'}
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            {kpis.map((k) => (
              <Card key={k.t} className="p-4">
                <p className="text-label uppercase text-on-surface-variant">{k.t}</p>
                <p className={`mt-1 text-h2 tabular-nums ${k.c ?? 'text-on-surface'}`}>{k.v}</p>
                <p className="mt-1 text-label text-on-surface-variant">{k.s}</p>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Ranking
              titulo="Por FIDC"
              ops={opsFidc}
              chave={porFidcChave}
              outraChave={porEmpresaChave}
              outroRotulo="empresa"
              selecionado={fidc}
              onEscolher={setFidc}
            />
            <Ranking
              titulo="Por empresa"
              ops={opsEmpresa}
              chave={porEmpresaChave}
              outraChave={porFidcChave}
              outroRotulo="FIDC"
              selecionado={empresa}
              onEscolher={setEmpresa}
            />
          </div>

          <FidcPorMes ops={opsFidc} />

          <Card>
            <div className="border-b border-border-muted px-4 py-3">
              <p className="text-h2 text-on-surface">Mês a mês</p>
              <p className="text-label text-on-surface-variant">Quanto foi antecipado e quanto custou em cada mês.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="text-left text-label uppercase text-on-surface-variant">
                    <th className="px-4 py-2 font-medium">Mês</th>
                    <th className="w-1/3 px-4 py-2 font-medium">Antecipado</th>
                    <th className="px-4 py-2 text-right font-medium">Recompras</th>
                    <th className="px-4 py-2 text-right font-medium">Custo</th>
                    <th className="px-4 py-2 text-right font-medium">Custo %</th>
                    <th className="px-4 py-2 text-right font-medium">Líquido</th>
                  </tr>
                </thead>
                <tbody>
                  {porMes.map(([mes, s]) => (
                    <tr key={mes} className="border-t border-border-muted">
                      <td className="px-4 py-2 font-medium capitalize text-on-surface">{nomeMes(mes)}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-3">
                          <Barra valor={s.bruto} max={maxMes} />
                          <span className="w-24 shrink-0 text-right tabular-nums">{curta(s.bruto)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{s.recompras ? curta(s.recompras) : '—'}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{curta(s.despesas)}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium">{s.bruto ? pct(s.despesas / s.bruto) : '—'}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{curta(s.liquido)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <div className="border-b border-border-muted px-4 py-3">
              <p className="text-h2 text-on-surface">Operações por dia</p>
              <p className="text-label text-on-surface-variant">Clique no dia para ver cada FIDC/empresa, como está na planilha.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="text-left text-label uppercase text-on-surface-variant">
                    <th className="px-4 py-2 font-medium">Dia</th>
                    <th className="px-4 py-2 font-medium">FIDCs</th>
                    <th className="px-4 py-2 text-right font-medium">Bruto</th>
                    <th className="px-4 py-2 text-right font-medium">Recompras</th>
                    <th className="px-4 py-2 text-right font-medium">Desconto</th>
                    <th className="px-4 py-2 text-right font-medium">Despesas</th>
                    <th className="px-4 py-2 text-right font-medium">Líquido</th>
                  </tr>
                </thead>
                <tbody>
                  {listaDias.slice(0, diasVisiveis).map((dia) => {
                    const s = dias.get(dia)!;
                    const ops = filtradas.filter((o) => o.data === dia);
                    const aberto = diaAberto === dia;
                    return (
                      <Fragment key={dia}>
                        <tr
                          onClick={() => setDiaAberto(aberto ? null : dia)}
                          className="cursor-pointer border-t border-border-muted hover:bg-primary/5"
                        >
                          <td className="px-4 py-2 font-medium text-on-surface">
                            <span className="mr-1 inline-block w-3 text-on-surface-variant">{aberto ? '▾' : '▸'}</span>
                            {br(dia)}
                          </td>
                          <td className="px-4 py-2 text-on-surface-variant">{[...new Set(ops.map((o) => o.fidc))].join(', ')}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{moeda(s.bruto)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{s.recompras ? moeda(s.recompras) : '—'}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{s.desconto + s.outros ? moeda(s.desconto + s.outros) : '—'}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{moeda(s.despesas)}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-medium">{moeda(s.liquido)}</td>
                        </tr>
                        {aberto &&
                          ops.map((o) => (
                            <tr key={o.id} className="bg-surface-container-low text-on-surface-variant">
                              <td className="py-1.5 pl-10 pr-4 text-label">{o.nome_original}</td>
                              <td className="px-4 py-1.5">
                                {o.fidc} · {o.empresa}
                              </td>
                              <td className="px-4 py-1.5 text-right tabular-nums">{moeda(o.bruto)}</td>
                              <td className="px-4 py-1.5 text-right tabular-nums">{o.recompras ? moeda(o.recompras) : '—'}</td>
                              <td className="px-4 py-1.5 text-right tabular-nums">
                                {o.desconto + o.refaturamento + o.nota_troca + o.substituicao + o.prorrogacao
                                  ? moeda(o.desconto + o.refaturamento + o.nota_troca + o.substituicao + o.prorrogacao)
                                  : '—'}
                              </td>
                              <td className="px-4 py-1.5 text-right tabular-nums">
                                {moeda(o.despesas)}
                                {o.bruto ? <span className="ml-1 text-label">({pct(o.despesas / o.bruto)})</span> : null}
                              </td>
                              <td className="px-4 py-1.5 text-right tabular-nums">{moeda(o.liquido)}</td>
                            </tr>
                          ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {listaDias.length > diasVisiveis && (
              <div className="border-t border-border-muted p-3 text-center">
                <Button type="button" variant="ghost" size="sm" onClick={() => setDiasVisiveis(diasVisiveis + 30)}>
                  Mostrar mais dias ({listaDias.length - diasVisiveis} restantes)
                </Button>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
