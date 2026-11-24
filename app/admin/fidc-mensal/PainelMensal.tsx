'use client';

import { Fragment, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { chaveFidc, ordemEmpresa, ordemFidc } from '@/lib/fidc/riscoOrdem';

export interface MesRisco {
  mes: string; // AAAA-MM
  data_posicao: string | null;
  arquivo: string | null;
  usuario_nome: string | null;
  importado_em: string;
}
export interface LinhaRisco {
  mes: string; // AAAA-MM
  ordem: number;
  empresa: string;
  fidc: string;
  a_vencer: number;
  vencidos: number;
}
export interface OpMes {
  mes: string;
  fidc: string;
  empresa: string;
  bruto: number;
  despesas: number;
  qtd: number;
}

// cores do gráfico: a vencer no azul do sistema; vencidos no vermelho de alerta (sempre com rótulo)
const COR_VENCER = '#2563eb';
const COR_VENCIDO = '#ba1a1a';

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const curto = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e6) return `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (a >= 1e3) return `R$ ${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  return moeda(v);
};
const pct = (v: number, casas = 1) => `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const nomeMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
const mesLongo = (m: string) => `${MESES_LONGOS[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`;
const br = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—');
const seletor = 'h-9 rounded-md border border-[#D1D5DB] bg-surface-container-lowest px-2 text-body-sm text-on-surface';

interface Soma {
  aVencer: number;
  vencidos: number;
  total: number;
}
const somar = (ls: LinhaRisco[]): Soma => {
  const aVencer = ls.reduce((s, l) => s + l.a_vencer, 0);
  const vencidos = ls.reduce((s, l) => s + l.vencidos, 0);
  return { aVencer, vencidos, total: aVencer + vencidos };
};

function Variacao({ atual, anterior }: { atual: number; anterior: number | null }) {
  if (anterior == null || !anterior) return <span className="text-on-surface-variant">—</span>;
  const v = (atual - anterior) / anterior;
  if (Math.abs(v) < 0.0005) return <span className="text-on-surface-variant">0,0%</span>;
  return (
    <span className={v > 0 ? 'text-on-surface' : 'text-on-surface-variant'}>
      {v > 0 ? '▲' : '▼'} {pct(Math.abs(v))}
    </span>
  );
}

function Indicador({ rotulo, valor, detalhe, alerta }: { rotulo: string; valor: string; detalhe?: React.ReactNode; alerta?: boolean }) {
  return (
    <Card className="p-4">
      <p className="text-label uppercase text-on-surface-variant">{rotulo}</p>
      <p className={`mt-1 text-h2 tabular-nums ${alerta ? 'text-error' : 'text-on-surface'}`}>{valor}</p>
      {detalhe && <p className="mt-0.5 text-label text-on-surface-variant">{detalhe}</p>}
    </Card>
  );
}

function Legenda({ itens }: { itens: { cor: string; rotulo: string }[] }) {
  return (
    <div className="flex flex-wrap gap-4 text-label text-on-surface-variant">
      {itens.map((i) => (
        <span key={i.rotulo} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: i.cor }} />
          {i.rotulo}
        </span>
      ))}
    </div>
  );
}

/** Barras verticais por mês. `partes` empilha de baixo para cima; clique escolhe o mês. */
function GraficoMeses({
  meses,
  partes,
  mesAtual,
  onEscolher,
  dica,
  rotuloTopo,
}: {
  meses: string[];
  partes: { cor: string; valor: (m: string) => number }[];
  mesAtual: string;
  onEscolher: (m: string) => void;
  dica: (m: string) => React.ReactNode;
  rotuloTopo: (m: string) => string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const L = 720;
  const A = 220;
  const topo = 22;
  const base = A - 24;
  const totais = meses.map((m) => partes.reduce((s, p) => s + p.valor(m), 0));
  const max = Math.max(1, ...totais);
  const passo = L / Math.max(1, meses.length);
  const larg = Math.min(44, passo * 0.6);
  const altura = (v: number) => (v / max) * (base - topo);
  // 4 linhas de grade discretas
  const grade = [0.25, 0.5, 0.75, 1].map((f) => max * f);
  const ativo = hover ?? null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${L} ${A}`} className="h-auto w-full" role="img" aria-label="Gráfico por mês">
        {grade.map((g) => (
          <g key={g}>
            <line x1={0} x2={L} y1={base - altura(g)} y2={base - altura(g)} stroke="#e5e7eb" strokeWidth={1} />
            <text x={2} y={base - altura(g) - 3} fontSize={10} fill="#64748b">
              {curto(g)}
            </text>
          </g>
        ))}
        <line x1={0} x2={L} y1={base} y2={base} stroke="#cbd5e1" strokeWidth={1} />
        {meses.map((m, i) => {
          const x = i * passo + (passo - larg) / 2;
          let y = base;
          const escolhido = m === mesAtual;
          const segs = partes.map((p) => p.valor(m)).filter((v) => v > 0).length;
          let n = 0;
          return (
            <g
              key={m}
              onMouseEnter={() => setHover(m)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onEscolher(m)}
              className="cursor-pointer"
              opacity={escolhido || ativo === m ? 1 : 0.55}
            >
              <rect x={i * passo} y={0} width={passo} height={A} fill="transparent" />
              {partes.map((p, j) => {
                const v = p.valor(m);
                if (v <= 0) return null;
                n++;
                const h = Math.max(1, altura(v));
                y -= h;
                const ultimo = n === segs;
                // 2px de espaço entre as partes; ponta de cima arredondada
                const yy = y;
                const hh = h - (ultimo ? 0 : 2);
                return ultimo ? (
                  <path
                    key={j}
                    d={`M${x},${yy + hh} V${yy + Math.min(4, hh)} Q${x},${yy} ${x + 4},${yy} H${x + larg - 4} Q${x + larg},${yy} ${x + larg},${yy + Math.min(4, hh)} V${yy + hh} Z`}
                    fill={p.cor}
                  />
                ) : (
                  <rect key={j} x={x} y={yy + 2} width={larg} height={Math.max(0.5, hh)} fill={p.cor} />
                );
              })}
              {(escolhido || ativo === m) && (
                <text x={x + larg / 2} y={base - altura(totais[i]) - 6} fontSize={11} textAnchor="middle" fill="#121c2a" fontWeight={600}>
                  {rotuloTopo(m)}
                </text>
              )}
              <text x={x + larg / 2} y={A - 8} fontSize={11} textAnchor="middle" fill={escolhido ? '#121c2a' : '#64748b'} fontWeight={escolhido ? 600 : 400}>
                {nomeMes(m)}
              </text>
            </g>
          );
        })}
      </svg>
      {ativo && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-md border border-border-muted bg-surface-container-lowest px-3 py-2 text-label shadow-md"
          style={{ left: `${Math.min(70, (meses.indexOf(ativo) / Math.max(1, meses.length)) * 100)}%` }}
        >
          {dica(ativo)}
        </div>
      )}
    </div>
  );
}

function Importar({ onFechar }: { onFechar: () => void }) {
  const router = useRouter();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [mes, setMes] = useState('');
  const [precisaMes, setPrecisaMes] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function enviar() {
    if (!arquivo) return;
    setEnviando(true);
    setErro(null);
    setOk(null);
    const fd = new FormData();
    fd.append('planilha', arquivo);
    if (mes) fd.append('mes', mes);
    try {
      const r = await fetch('/api/fidc/risco', { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({ erro: 'Resposta inválida do servidor.' }));
      if (!r.ok || j.erro) {
        setPrecisaMes(Boolean(j.precisaMes));
        setErro(j.erro ?? 'Não consegui importar.');
      } else {
        setOk(
          `✅ ${mesLongo(j.mes)}${j.atualizado ? ' (atualizado)' : ''}: ${j.linhas} linhas, ${moeda(j.aVencer)} a vencer e ${moeda(j.vencidos)} vencidos` +
            (j.dataPosicao ? ` · posição de ${br(j.dataPosicao)}` : '')
        );
        router.refresh();
      }
    } catch {
      setErro('Falha de conexão com o servidor.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-md border border-border-muted bg-surface-container-low p-3">
      <p className="text-body-sm text-on-surface-variant">
        Planilha <strong>RISCO GERAL OPERAÇÕES FIDCs &lt;MÊS&gt; &lt;ANO&gt;.xlsx</strong>. O mês sai do nome do arquivo; importar o mesmo mês de novo
        substitui.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
          className="block text-body-sm text-on-surface file:mr-3 file:h-9 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:text-body-sm file:font-medium file:text-primary hover:file:bg-primary/15"
        />
        {precisaMes && (
          <label className="flex flex-col text-label text-on-surface-variant">
            Mês
            <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className={seletor} />
          </label>
        )}
        <Button onClick={enviar} disabled={!arquivo || enviando || (precisaMes && !mes)}>
          {enviando ? 'Importando…' : 'Importar'}
        </Button>
        <Button variant="ghost" onClick={onFechar}>
          Fechar
        </Button>
      </div>
      {erro && <p className="text-body-sm text-error">{erro}</p>}
      {ok && <p className="text-body-sm text-on-surface">{ok}</p>}
    </div>
  );
}

export function PainelMensal({ meses, linhas, ops }: { meses: MesRisco[]; linhas: LinhaRisco[]; ops: OpMes[] }) {
  const lista = meses.map((m) => m.mes);
  const [mes, setMes] = useState(lista[lista.length - 1] ?? '');
  const [importando, setImportando] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);

  const porMes = useMemo(() => {
    const m = new Map<string, LinhaRisco[]>();
    for (const l of linhas) m.set(l.mes, [...(m.get(l.mes) ?? []), l]);
    return m;
  }, [linhas]);
  const somaMes = useMemo(() => new Map(lista.map((m) => [m, somar(porMes.get(m) ?? [])])), [lista, porMes]);

  const anterior = lista[lista.indexOf(mes) - 1] ?? null;
  const doMes = porMes.get(mes) ?? [];
  const doAnterior = anterior ? porMes.get(anterior) ?? [] : [];
  const s = somaMes.get(mes) ?? { aVencer: 0, vencidos: 0, total: 0 };
  const sAnt = anterior ? somaMes.get(anterior) ?? null : null;
  const info = meses.find((m) => m.mes === mes);

  const opsMes = ops.filter((o) => o.mes === mes);
  const antecipado = opsMes.reduce((t, o) => t + o.bruto, 0);
  const custo = opsMes.reduce((t, o) => t + o.despesas, 0);

  // por FIDC (DIN.2)
  const fidcs = Array.from(new Set(doMes.map((l) => l.fidc))).sort(ordemFidc);
  const porFidc = fidcs
    .map((f) => {
      const k = chaveFidc(f);
      const os = opsMes.filter((o) => chaveFidc(o.fidc) === k);
      return {
        fidc: f,
        ...somar(doMes.filter((l) => l.fidc === f)),
        anterior: anterior ? somar(doAnterior.filter((l) => l.fidc === f)).total : null,
        antecipado: os.reduce((t, o) => t + o.bruto, 0),
        custo: os.reduce((t, o) => t + o.despesas, 0),
      };
    })
    .sort((a, b) => b.total - a.total);
  const maxFidc = Math.max(1, ...porFidc.map((f) => f.total));

  // por empresa (DIN.1)
  const empresas = Array.from(new Set(doMes.map((l) => l.empresa))).sort(ordemEmpresa);
  const porEmpresa = empresas.map((e) => ({
    empresa: e,
    ...somar(doMes.filter((l) => l.empresa === e)),
    anterior: anterior ? somar(doAnterior.filter((l) => l.empresa === e)).total : null,
    antecipado: opsMes.filter((o) => o.empresa.toUpperCase() === e).reduce((t, o) => t + o.bruto, 0),
  }));
  const maxEmpresa = Math.max(1, ...porEmpresa.map((e) => e.total));

  // mapa FIDC × mês (total do risco)
  const todasFidcs = Array.from(new Set(linhas.map((l) => l.fidc))).sort(ordemFidc);
  const celula = (f: string, m: string) => somar((porMes.get(m) ?? []).filter((l) => l.fidc === f)).total;
  const maxCelula = Math.max(1, ...todasFidcs.flatMap((f) => lista.map((m) => celula(f, m))));

  if (!lista.length) {
    return (
      <Card className="p-6">
        <p className="text-body text-on-surface">Nenhum mês importado ainda.</p>
        <Importar onFechar={() => undefined} />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <label className="flex flex-col text-label text-on-surface-variant">
          Mês
          <select value={mes} onChange={(e) => setMes(e.target.value)} className={`${seletor} min-w-[180px]`}>
            {[...lista].reverse().map((m) => (
              <option key={m} value={m}>
                {mesLongo(m)}
              </option>
            ))}
          </select>
        </label>
        <a href={`/api/fidc/risco/exportar?mes=${mes}`} className="inline-flex">
          <Button type="button">Baixar Excel do mês</Button>
        </a>
        <Button variant="secondary" onClick={() => setImportando((v) => !v)}>
          Importar planilha RISCO
        </Button>
        <p className="ml-auto text-label text-on-surface-variant">
          Posição de {br(info?.data_posicao ?? null)}
          {info?.usuario_nome ? ` · importado por ${info.usuario_nome}` : ''}
        </p>
        {importando && (
          <div className="w-full">
            <Importar onFechar={() => setImportando(false)} />
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Indicador rotulo="Risco total" valor={curto(s.total)} detalhe={<Variacao atual={s.total} anterior={sAnt?.total ?? null} />} />
        <Indicador rotulo="A vencer" valor={curto(s.aVencer)} detalhe={moeda(s.aVencer)} />
        <Indicador rotulo="Vencidos" valor={moeda(s.vencidos)} detalhe={`${pct(s.total ? s.vencidos / s.total : 0, 2)} do risco`} alerta={s.vencidos > 0} />
        <Indicador rotulo="Antecipado no mês" valor={curto(antecipado)} detalhe={`${opsMes.reduce((t, o) => t + o.qtd, 0)} operações`} />
        <Indicador rotulo="Custo no mês" valor={curto(custo)} detalhe={antecipado ? `${pct(custo / antecipado, 2)} do antecipado` : '—'} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-h2 text-on-surface">Evolução do risco</h2>
            <Legenda
              itens={[
                { cor: COR_VENCER, rotulo: 'A vencer' },
                { cor: COR_VENCIDO, rotulo: 'Vencidos' },
              ]}
            />
          </div>
          <GraficoMeses
            meses={lista}
            mesAtual={mes}
            onEscolher={setMes}
            partes={[
              { cor: COR_VENCER, valor: (m) => somaMes.get(m)?.aVencer ?? 0 },
              { cor: COR_VENCIDO, valor: (m) => somaMes.get(m)?.vencidos ?? 0 },
            ]}
            rotuloTopo={(m) => curto(somaMes.get(m)?.total ?? 0)}
            dica={(m) => {
              const x = somaMes.get(m)!;
              return (
                <>
                  <p className="font-semibold capitalize text-on-surface">{mesLongo(m)}</p>
                  <p>Total: {moeda(x.total)}</p>
                  <p>A vencer: {moeda(x.aVencer)}</p>
                  <p>Vencidos: {moeda(x.vencidos)}</p>
                </>
              );
            }}
          />
        </Card>
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-h2 text-on-surface">Vencidos por mês</h2>
            <span className="text-label text-on-surface-variant">clique num mês para ver o detalhe</span>
          </div>
          <GraficoMeses
            meses={lista}
            mesAtual={mes}
            onEscolher={setMes}
            partes={[{ cor: COR_VENCIDO, valor: (m) => somaMes.get(m)?.vencidos ?? 0 }]}
            rotuloTopo={(m) => curto(somaMes.get(m)?.vencidos ?? 0)}
            dica={(m) => {
              const x = somaMes.get(m)!;
              return (
                <>
                  <p className="font-semibold capitalize text-on-surface">{mesLongo(m)}</p>
                  <p>Vencidos: {moeda(x.vencidos)}</p>
                  <p>{pct(x.total ? x.vencidos / x.total : 0, 2)} do risco</p>
                </>
              );
            }}
          />
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
          <h2 className="text-h2 text-on-surface">Risco por FIDC · {mesLongo(mes)}</h2>
          <span className="text-label text-on-surface-variant">antecipado e custo do mês vêm das operações / borderôs</span>
        </div>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-body-sm">
            <thead>
              <tr className="text-label uppercase text-on-surface-variant">
                <th className="px-4 py-2 text-left font-medium">FIDC</th>
                <th className="w-1/4 px-4 py-2 font-medium">Risco</th>
                <th className="px-4 py-2 text-right font-medium">A vencer</th>
                <th className="px-4 py-2 text-right font-medium">Vencidos</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
                <th className="px-4 py-2 text-right font-medium">Vs. mês anterior</th>
                <th className="px-4 py-2 text-right font-medium">Antecipado no mês</th>
                <th className="px-4 py-2 text-right font-medium">Custo no mês</th>
              </tr>
            </thead>
            <tbody>
              {porFidc.map((f) => (
                <tr key={f.fidc} className="border-t border-border-muted hover:bg-primary/5">
                  <td className="px-4 py-1.5 font-medium text-on-surface">{f.fidc}</td>
                  <td className="px-4 py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-container">
                        <div style={{ width: `${(f.aVencer / maxFidc) * 100}%`, background: COR_VENCER }} />
                        {f.vencidos > 0 && <div style={{ width: `${Math.max(1, (f.vencidos / maxFidc) * 100)}%`, background: COR_VENCIDO, marginLeft: 2 }} />}
                      </div>
                      <span className="w-10 text-right text-label tabular-nums text-on-surface-variant">{s.total ? Math.round((f.total / s.total) * 100) : 0}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{moeda(f.aVencer)}</td>
                  <td className={`px-4 py-1.5 text-right tabular-nums ${f.vencidos ? 'text-error' : 'text-on-surface-variant'}`}>{f.vencidos ? moeda(f.vencidos) : '—'}</td>
                  <td className="px-4 py-1.5 text-right font-semibold tabular-nums">{moeda(f.total)}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">
                    <Variacao atual={f.total} anterior={f.anterior} />
                  </td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{f.antecipado ? moeda(f.antecipado) : '—'}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{f.custo ? moeda(f.custo) : '—'}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-border-muted bg-surface-container-low font-semibold">
                <td className="px-4 py-2">Total Geral</td>
                <td />
                <td className="px-4 py-2 text-right tabular-nums">{moeda(s.aVencer)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-error">{moeda(s.vencidos)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{moeda(s.total)}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  <Variacao atual={s.total} anterior={sAnt?.total ?? null} />
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{moeda(antecipado)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{moeda(custo)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
          <h2 className="text-h2 text-on-surface">Risco por empresa · {mesLongo(mes)}</h2>
          <span className="text-label text-on-surface-variant">clique na empresa para ver as FIDCs</span>
        </div>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-body-sm">
            <thead>
              <tr className="text-label uppercase text-on-surface-variant">
                <th className="px-4 py-2 text-left font-medium">Empresa</th>
                <th className="w-1/4 px-4 py-2 font-medium">Risco</th>
                <th className="px-4 py-2 text-right font-medium">A vencer</th>
                <th className="px-4 py-2 text-right font-medium">Vencidos</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
                <th className="px-4 py-2 text-right font-medium">Vs. mês anterior</th>
                <th className="px-4 py-2 text-right font-medium">Antecipado no mês</th>
              </tr>
            </thead>
            <tbody>
              {porEmpresa.map((e) => {
                const abertaAqui = aberta === e.empresa;
                const filhas = Array.from(new Set(doMes.filter((l) => l.empresa === e.empresa).map((l) => l.fidc)))
                  .sort(ordemFidc)
                  .map((f) => ({ fidc: f, ...somar(doMes.filter((l) => l.empresa === e.empresa && l.fidc === f)) }));
                return (
                  <Fragment key={e.empresa}>
                    <tr className="cursor-pointer border-t border-border-muted hover:bg-primary/5" onClick={() => setAberta(abertaAqui ? null : e.empresa)}>
                      <td className="px-4 py-1.5 font-medium text-on-surface">
                        <span className="mr-1 inline-block w-3 text-on-surface-variant">{abertaAqui ? '▾' : '▸'}</span>
                        {e.empresa}
                      </td>
                      <td className="px-4 py-1.5">
                        <div className="flex items-center gap-2">
                          <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-container">
                            <div style={{ width: `${(e.aVencer / maxEmpresa) * 100}%`, background: COR_VENCER }} />
                            {e.vencidos > 0 && (
                              <div style={{ width: `${Math.max(1, (e.vencidos / maxEmpresa) * 100)}%`, background: COR_VENCIDO, marginLeft: 2 }} />
                            )}
                          </div>
                          <span className="w-10 text-right text-label tabular-nums text-on-surface-variant">{s.total ? Math.round((e.total / s.total) * 100) : 0}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-1.5 text-right tabular-nums">{moeda(e.aVencer)}</td>
                      <td className={`px-4 py-1.5 text-right tabular-nums ${e.vencidos ? 'text-error' : 'text-on-surface-variant'}`}>{e.vencidos ? moeda(e.vencidos) : '—'}</td>
                      <td className="px-4 py-1.5 text-right font-semibold tabular-nums">{moeda(e.total)}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums">
                        <Variacao atual={e.total} anterior={e.anterior} />
                      </td>
                      <td className="px-4 py-1.5 text-right tabular-nums">{e.antecipado ? moeda(e.antecipado) : '—'}</td>
                    </tr>
                    {abertaAqui &&
                      filhas.map((f) => (
                        <tr key={f.fidc} className="bg-surface-container-low/60 text-on-surface-variant">
                          <td className="py-1 pl-10 pr-4">{f.fidc}</td>
                          <td />
                          <td className="px-4 py-1 text-right tabular-nums">{f.aVencer ? moeda(f.aVencer) : '—'}</td>
                          <td className={`px-4 py-1 text-right tabular-nums ${f.vencidos ? 'text-error' : ''}`}>{f.vencidos ? moeda(f.vencidos) : '—'}</td>
                          <td className="px-4 py-1 text-right tabular-nums">{f.total ? moeda(f.total) : '—'}</td>
                          <td colSpan={2} />
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 pt-4">
          <h2 className="text-h2 text-on-surface">Risco por FIDC mês a mês</h2>
          <p className="text-label text-on-surface-variant">quanto mais escuro, maior o risco; passe o mouse para ver vencidos</p>
        </div>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-body-sm">
            <thead>
              <tr className="text-label uppercase text-on-surface-variant">
                <th className="sticky left-0 z-10 bg-surface-container-lowest px-4 py-2 text-left font-medium">FIDC</th>
                {lista.map((m) => (
                  <th
                    key={m}
                    onClick={() => setMes(m)}
                    className={`cursor-pointer whitespace-nowrap px-3 py-2 text-right font-medium ${m === mes ? 'text-primary' : ''}`}
                  >
                    {nomeMes(m)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {todasFidcs.map((f) => (
                <tr key={f}>
                  <td className="sticky left-0 z-10 whitespace-nowrap border-b border-border-muted bg-surface-container-lowest px-4 py-1.5 font-medium text-on-surface">
                    {f}
                  </td>
                  {lista.map((m) => {
                    const ls = (porMes.get(m) ?? []).filter((l) => l.fidc === f);
                    const x = somar(ls);
                    const t = x.total / maxCelula;
                    return (
                      <td
                        key={m}
                        title={ls.length ? `${f} · ${nomeMes(m)}: ${moeda(x.total)} (a vencer ${moeda(x.aVencer)}, vencidos ${moeda(x.vencidos)})` : 'não estava na planilha'}
                        className={`whitespace-nowrap border-b border-l border-white px-3 py-1.5 text-right tabular-nums ${t > 0.6 ? 'text-white' : 'text-on-surface'} ${m === mes ? 'outline outline-1 -outline-offset-1 outline-primary' : ''}`}
                        style={{ background: x.total ? `rgba(37, 99, 235, ${0.08 + t * 0.85})` : undefined }}
                      >
                        {x.total ? curto(x.total) : ls.length ? '0' : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
