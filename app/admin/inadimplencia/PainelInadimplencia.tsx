'use client';

import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { FAIXAS, TIPOS_CARTEIRA, faixaDe, filtrar, type Filtros, type TituloVencido } from '@/lib/inadimplencia/comum';

export interface Foto {
  dia: string;
  empresa_id: string;
  tipo: string;
  qtd: number;
  saldo: number;
}

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const curto = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e6) return `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`;
  if (a >= 1e3) return `R$ ${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  return moeda(v);
};
const pct = (v: number) => `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const br = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—');
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const nomeMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
const seletor = 'h-9 rounded-md border border-[#D1D5DB] bg-surface-container-lowest px-2 text-body-sm text-on-surface';

// atraso: uma cor só (vermelho), mais escura quanto mais velho — com o rótulo sempre ao lado
const COR_FAIXA = ['#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c', '#7f1d1d'];
const COR_TIPO: Record<string, string> = { fidc: '#2563eb', banco: '#0284c7', carteira: '#475569', outra: '#94a3b8' };

const soma = (ts: TituloVencido[]) => ts.reduce((s, t) => s + t.saldo, 0);

/** A planilha "INAD <VENDEDOR>" da cobrança, na tela: mesmas colunas, ordem e total do Excel. */
function PlanilhaVendedor({ nome, ts }: { nome: string; ts: TituloVencido[] }) {
  const repr = (v: string) => v.replace(/\(.*$/, '').replace(/\s+/g, ' ').trim().toUpperCase() || v.toUpperCase();
  const emp = (e: string) => e.replace(/[()]/g, '').replace(/MATRIZ.*$/i, '').replace(/\s+/g, ' ').trim().toUpperCase();
  const linhas = [...ts].sort((a, b) => a.clienteFantasia.localeCompare(b.clienteFantasia) || a.vencimento.localeCompare(b.vencimento));
  const cab = ['Representante', 'NF', 'Cliente', 'Emissão', 'Venc.', 'Valor', 'Cidade', 'Empresa', 'Descrição bancária'];
  const td = 'whitespace-nowrap border border-border-muted px-2 py-1';
  return (
    <div className="overflow-x-auto rounded-md border border-border-muted bg-surface-container-lowest">
      <div className="border-b border-border-muted bg-[#D0CECE] px-3 py-2 text-center text-body font-bold text-[#111]">INADIMPLÊNCIA {repr(nome)}</div>
      <table className="w-full text-body-sm">
        <thead>
          <tr>
            {cab.map((c, i) => (
              <th key={c} className={`${td} text-label font-semibold uppercase text-on-surface ${i === 5 ? 'text-right' : 'text-center'}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((t) => (
            <tr key={t.finMovId} className="hover:bg-primary/5">
              <td className={`${td} text-center`}>{repr(t.vendedor)}</td>
              <td className={`${td} text-center tabular-nums`}>{t.documento}</td>
              <td className={`${td} text-center`} title={`${t.cliente} · ${t.cnpj}`}>
                {t.clienteFantasia}
              </td>
              <td className={`${td} text-center tabular-nums`}>{br(t.emissao)}</td>
              <td className={`${td} text-center tabular-nums ${t.dias > 90 ? 'font-semibold text-error' : ''}`} title={`${t.dias} dias de atraso`}>
                {br(t.vencimento)}
              </td>
              <td className={`${td} text-right tabular-nums`}>{moeda(t.saldo)}</td>
              <td className={`${td} text-center`}>{t.cidade.toUpperCase()}</td>
              <td className={`${td} text-center`}>{emp(t.empresa)}</td>
              <td className={`${td} text-center`} title={t.carteira}>
                {t.descricao}
              </td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td colSpan={5} className={`${td} text-right`}>
              TOTAL ({linhas.length} título{linhas.length === 1 ? '' : 's'})
            </td>
            <td className={`${td} text-right tabular-nums`}>{moeda(soma(linhas))}</td>
            <td colSpan={3} className={td} />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Indicador({ rotulo, valor, detalhe, alerta }: { rotulo: string; valor: string; detalhe?: string; alerta?: boolean }) {
  return (
    <Card className="p-4">
      <p className="text-label uppercase text-on-surface-variant">{rotulo}</p>
      <p className={`mt-1 text-h2 tabular-nums ${alerta ? 'text-error' : 'text-on-surface'}`}>{valor}</p>
      {detalhe && <p className="mt-0.5 text-label text-on-surface-variant">{detalhe}</p>}
    </Card>
  );
}

/** Barras horizontais com rótulo e valor; clique filtra. */
function Barras({
  itens,
  ativo,
  onClicar,
}: {
  itens: { id: string; rotulo: string; valor: number; qtd: number; cor: string }[];
  ativo?: string;
  onClicar?: (id: string) => void;
}) {
  const max = Math.max(1, ...itens.map((i) => i.valor));
  const total = itens.reduce((s, i) => s + i.valor, 0);
  return (
    <div className="space-y-1.5">
      {itens.map((i) => (
        <button
          key={i.id}
          type="button"
          onClick={() => onClicar?.(i.id)}
          title={`${i.rotulo}: ${moeda(i.valor)} em ${i.qtd} títulos`}
          className={`grid w-full grid-cols-[120px_1fr_150px] items-center gap-3 rounded-md px-2 py-1 text-left text-body-sm hover:bg-primary/5 ${
            ativo === i.id ? 'bg-primary/10' : ''
          }`}
        >
          <span className="truncate text-on-surface">{i.rotulo}</span>
          <span className="h-3 w-full rounded-sm bg-surface-container">
            <span className="block h-3 rounded-sm" style={{ width: `${i.valor ? Math.max(1, (i.valor / max) * 100) : 0}%`, background: i.cor }} />
          </span>
          <span className="text-right tabular-nums text-on-surface">
            {curto(i.valor)} <span className="text-label text-on-surface-variant">· {total ? pct(i.valor / total) : '—'}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** Colunas por mês (ou dia), uma cor; passar o mouse mostra o valor. */
function Colunas({ itens, cor, rotuloX }: { itens: { k: string; valor: number; qtd?: number }[]; cor: string; rotuloX: (k: string) => string }) {
  const [hover, setHover] = useState<string | null>(null);
  const L = 720;
  const A = 190;
  const base = A - 22;
  const max = Math.max(1, ...itens.map((i) => i.valor));
  const passo = L / Math.max(1, itens.length);
  const larg = Math.min(36, passo * 0.65);
  const h = (v: number) => (v / max) * (base - 20);
  const mostrarRotulo = (i: number) => itens.length <= 14 || i % Math.ceil(itens.length / 12) === 0 || i === itens.length - 1;
  const atual = itens.find((i) => i.k === hover);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${L} ${A}`} className="h-auto w-full" role="img">
        {[0.5, 1].map((f) => (
          <g key={f}>
            <line x1={0} x2={L} y1={base - h(max * f)} y2={base - h(max * f)} stroke="#e5e7eb" />
            <text x={2} y={base - h(max * f) - 3} fontSize={10} fill="#64748b">
              {curto(max * f)}
            </text>
          </g>
        ))}
        <line x1={0} x2={L} y1={base} y2={base} stroke="#cbd5e1" />
        {itens.map((it, i) => {
          const x = i * passo + (passo - larg) / 2;
          const hh = Math.max(it.valor ? 1 : 0, h(it.valor));
          return (
            <g key={it.k} onMouseEnter={() => setHover(it.k)} onMouseLeave={() => setHover(null)}>
              <rect x={i * passo} y={0} width={passo} height={A} fill="transparent" />
              <path
                d={`M${x},${base} V${base - hh + Math.min(3, hh)} Q${x},${base - hh} ${x + 3},${base - hh} H${x + larg - 3} Q${x + larg},${base - hh} ${x + larg},${base - hh + Math.min(3, hh)} V${base} Z`}
                fill={cor}
                opacity={hover && hover !== it.k ? 0.5 : 1}
              />
              {mostrarRotulo(i) && (
                <text x={x + larg / 2} y={A - 6} fontSize={10} textAnchor="middle" fill="#64748b">
                  {rotuloX(it.k)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {atual && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-md border border-border-muted bg-surface-container-lowest px-3 py-2 text-label shadow-md"
          style={{ left: `${Math.min(72, (itens.indexOf(atual) / Math.max(1, itens.length)) * 100)}%` }}
        >
          <p className="font-semibold text-on-surface">{rotuloX(atual.k)}</p>
          <p>{moeda(atual.valor)}</p>
          {atual.qtd != null && <p>{atual.qtd} títulos</p>}
        </div>
      )}
    </div>
  );
}

type Ordem = 'dias' | 'saldo' | 'vencimento' | 'cliente';

export function PainelInadimplencia({ titulos, incluirGrupo, fotos }: { titulos: TituloVencido[]; incluirGrupo: boolean; fotos: Foto[] }) {
  const [f, setF] = useState<Filtros>({});
  const [ordem, setOrdem] = useState<Ordem>('dias');
  const [pagina, setPagina] = useState(0);
  const [clienteAberto, setClienteAberto] = useState<string | null>(null);
  const [textoVendedor, setTextoVendedor] = useState('');
  const escolherVendedor = (cod: string, nome: string) => {
    const tira = f.vendedor === cod;
    setF((x) => ({ ...x, vendedor: tira ? '' : cod }));
    setTextoVendedor(tira ? '' : `${cod} · ${nome}`);
    setPagina(0);
  };
  const muda = (p: Partial<Filtros>) => {
    setF((x) => ({ ...x, ...p }));
    setPagina(0);
  };

  const opcoes = useMemo(() => {
    const emp = new Map<string, string>();
    titulos.forEach((t) => emp.set(t.empresaId, t.empresa));
    return {
      empresas: Array.from(emp.entries()).sort((a, b) => a[1].localeCompare(b[1])),
      fidcs: Array.from(new Set(titulos.map((t) => t.fidc).filter(Boolean) as string[])).sort(),
      vendedores: Array.from(new Map(titulos.filter((t) => t.vendedorCod).map((t) => [t.vendedorCod, t.vendedor])).entries()).sort((a, b) =>
        a[1].localeCompare(b[1])
      ),
      regioes: Array.from(new Set(titulos.map((t) => t.regiao))).sort(),
    };
  }, [titulos]);

  const lista = useMemo(() => filtrar(titulos, f), [titulos, f]);
  const total = soma(lista);
  const clientes = new Set(lista.map((t) => `${t.empresaId}|${t.clienteCod}`)).size;
  const emFidc = soma(lista.filter((t) => t.tipoCarteira === 'fidc'));
  const mais90 = soma(lista.filter((t) => t.dias > 90));

  // sem o filtro da própria dimensão, para o gráfico mostrar todas as opções
  const porFaixa = FAIXAS.map((x, i) => {
    const ts = filtrar(titulos, { ...f, faixa: '' }).filter((t) => faixaDe(t.dias) === x.id);
    return { id: x.id, rotulo: x.rotulo, valor: soma(ts), qtd: ts.length, cor: COR_FAIXA[i] };
  });
  const porTipo = TIPOS_CARTEIRA.map((x) => {
    const ts = filtrar(titulos, { ...f, tipo: '' }).filter((t) => t.tipoCarteira === x.id);
    return { id: x.id, rotulo: x.rotulo, valor: soma(ts), qtd: ts.length, cor: COR_TIPO[x.id] };
  }).filter((x) => x.qtd);

  // por mês de vencimento (últimos 24 meses; o resto junta em "antes")
  const porMes = useMemo(() => {
    const m = new Map<string, { valor: number; qtd: number }>();
    for (const t of lista) {
      const k = t.vencimento.slice(0, 7);
      const s = m.get(k) ?? { valor: 0, qtd: 0 };
      s.valor += t.saldo;
      s.qtd++;
      m.set(k, s);
    }
    const ks = Array.from(m.keys()).sort();
    const ultimos = ks.slice(-24);
    const antes = ks.slice(0, -24).reduce((s, k) => ({ valor: s.valor + m.get(k)!.valor, qtd: s.qtd + m.get(k)!.qtd }), { valor: 0, qtd: 0 });
    return [...(antes.qtd ? [{ k: 'antes', ...antes }] : []), ...ultimos.map((k) => ({ k, ...m.get(k)! }))];
  }, [lista]);

  // evolução: total vencido em cada dia guardado (clientes de fora do grupo), respeitando empresa e carteira
  const evolucao = useMemo(() => {
    const m = new Map<string, { valor: number; qtd: number }>();
    for (const x of fotos) {
      if (f.empresa && x.empresa_id !== f.empresa) continue;
      if (f.tipo && x.tipo !== f.tipo) continue;
      const s = m.get(x.dia) ?? { valor: 0, qtd: 0 };
      s.valor += x.saldo;
      s.qtd += x.qtd;
      m.set(x.dia, s);
    }
    return Array.from(m.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-90)
      .map(([k, v]) => ({ k, ...v }));
  }, [fotos, f.empresa, f.tipo]);

  const porEmpresa = useMemo(() => {
    const m = new Map<string, { empresa: string; ts: TituloVencido[] }>();
    for (const t of lista) {
      const s = m.get(t.empresaId) ?? { empresa: t.empresa, ts: [] };
      s.ts.push(t);
      m.set(t.empresaId, s);
    }
    return Array.from(m.entries())
      .map(([id, s]) => ({ id, empresa: s.empresa, ts: s.ts, total: soma(s.ts) }))
      .sort((a, b) => b.total - a.total);
  }, [lista]);

  const ranking = useMemo(() => {
    const m = new Map<string, { cliente: string; cnpj: string; empresa: string; ts: TituloVencido[] }>();
    for (const t of lista) {
      const k = `${t.empresaId}|${t.clienteCod}`;
      const s = m.get(k) ?? { cliente: t.cliente, cnpj: t.cnpj, empresa: t.empresa, ts: [] };
      s.ts.push(t);
      m.set(k, s);
    }
    return Array.from(m.entries())
      .map(([k, s]) => ({ k, ...s, total: soma(s.ts), maior: Math.max(...s.ts.map((t) => t.dias)) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 30);
  }, [lista]);

  const ordenada = useMemo(() => {
    const l = [...lista];
    if (ordem === 'dias') l.sort((a, b) => b.dias - a.dias || b.saldo - a.saldo);
    if (ordem === 'saldo') l.sort((a, b) => b.saldo - a.saldo);
    if (ordem === 'vencimento') l.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    if (ordem === 'cliente') l.sort((a, b) => a.cliente.localeCompare(b.cliente));
    return l;
  }, [lista, ordem]);
  const POR_PAGINA = 100;
  const paginas = Math.max(1, Math.ceil(ordenada.length / POR_PAGINA));

  const params = new URLSearchParams();
  if (incluirGrupo) params.set('grupo', '1');
  Object.entries(f).forEach(([k, v]) => v && params.set(k, String(v)));
  /** Link da planilha no modelo da cobrança com os filtros da tela + os informados. */
  const linkCobranca = (extra: Partial<Filtros>) => {
    const q = new URLSearchParams(params);
    Object.entries(extra).forEach(([k, v]) => (v ? q.set(k, String(v)) : q.delete(k)));
    return `/api/inadimplencia/cobranca?${q.toString()}`;
  };

  // por vendedor (com carteira / recompra / FIDC, como a cobrança separa)
  const porVendedor = useMemo(() => {
    const m = new Map<string, TituloVencido[]>();
    lista.forEach((t) => m.set(t.vendedorCod || 'SEM', [...(m.get(t.vendedorCod || 'SEM') ?? []), t]));
    return Array.from(m.entries())
      .map(([cod, ts]) => ({
        cod,
        nome: ts[0].vendedor,
        regiao: ts[0].regiao,
        ts,
        carteira: soma(ts.filter((t) => t.descricao === 'CARTEIRA')),
        recompra: soma(ts.filter((t) => t.descricao === 'RECOMPRA')),
        fidc: soma(ts.filter((t) => t.descricao !== 'CARTEIRA' && t.descricao !== 'RECOMPRA')),
        total: soma(ts),
      }))
      .sort((a, b) => b.total - a.total);
  }, [lista]);
  const porRegiao = useMemo(() => {
    const m = new Map<string, TituloVencido[]>();
    lista.forEach((t) => m.set(t.regiao, [...(m.get(t.regiao) ?? []), t]));
    return Array.from(m.entries())
      .map(([regiao, ts]) => ({
        regiao,
        vendedores: new Set(ts.map((t) => t.vendedorCod)).size,
        qtd: ts.length,
        carteira: soma(ts.filter((t) => t.descricao === 'CARTEIRA')),
        recompra: soma(ts.filter((t) => t.descricao === 'RECOMPRA')),
        fidc: soma(ts.filter((t) => t.descricao !== 'CARTEIRA' && t.descricao !== 'RECOMPRA')),
        total: soma(ts),
      }))
      .sort((a, b) => b.total - a.total);
  }, [lista]);
  const [verTodosVendedores, setVerTodosVendedores] = useState(false);
  // seleção de vendedores para baixar de uma vez
  const [buscaVend, setBuscaVend] = useState('');
  const [marcadosVend, setMarcadosVend] = useState<Set<string>>(new Set());
  const normal = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  const vendVisiveis = porVendedor.filter((v) => !buscaVend.trim() || v.cod.toLowerCase() === buscaVend.trim().toLowerCase() || normal(`${v.cod} ${v.nome}`).includes(normal(buscaVend.trim())));
  const vendNaTela = buscaVend.trim() || verTodosVendedores ? vendVisiveis : vendVisiveis.slice(0, 15);
  const alternarVend = (cod: string) =>
    setMarcadosVend((s) => {
      const n = new Set(s);
      if (n.has(cod)) n.delete(cod);
      else n.add(cod);
      return n;
    });
  const linkSelecionados = (formato: 'abas' | 'zip', cods: string[]) => {
    const q = new URLSearchParams(params);
    q.delete('vendedor');
    q.set('vendedores', cods.join(','));
    if (formato === 'zip') q.set('formato', 'zip');
    return `/api/inadimplencia/cobranca?${q.toString()}`;
  };
  const [vendAberto, setVendAberto] = useState<string | null>(null);
  const selecionados = porVendedor.filter((v) => marcadosVend.has(v.cod));
  const totalSelecionado = selecionados.reduce((s, v) => s + v.total, 0);
  const botaoBaixar = (href: string, rotulo = 'Baixar planilha') => (
    <a
      href={href}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex h-7 items-center whitespace-nowrap rounded-md border border-primary px-2 text-label font-medium text-primary hover:bg-primary/5"
    >
      {rotulo}
    </a>
  );

  const tituloLinha = (t: TituloVencido) => (
    <tr key={t.finMovId} className="border-t border-border-muted">
      <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{t.documento}</td>
      <td className="px-3 py-1.5">
        <span className="text-on-surface">{t.cliente}</span>
        <span className="ml-1 text-label text-on-surface-variant">{t.cnpj}</span>
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 text-on-surface-variant">{t.empresa}</td>
      <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{br(t.vencimento)}</td>
      <td className={`whitespace-nowrap px-3 py-1.5 text-right tabular-nums ${t.dias > 90 ? 'font-semibold text-error' : ''}`}>{t.dias} d</td>
      <td className="whitespace-nowrap px-3 py-1.5 text-right font-medium tabular-nums">{moeda(t.saldo)}</td>
      <td className="px-3 py-1.5">
        <span className="inline-flex items-center gap-1.5" title={t.carteira}>
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: COR_TIPO[t.tipoCarteira] }} />
          <span className="text-on-surface">{t.descricao}</span>
        </span>
      </td>
      <td className="px-3 py-1.5 text-on-surface-variant">
        {t.vendedorCod ? <span className="mr-1 tabular-nums">{t.vendedorCod} ·</span> : null}
        {t.vendedor}
      </td>
    </tr>
  );

  const cabecalhoTitulos = (
    <tr className="text-label uppercase text-on-surface-variant">
      <th className="px-3 py-2 text-left font-medium">Documento</th>
      <th className="px-3 py-2 text-left font-medium">Cliente</th>
      <th className="px-3 py-2 text-left font-medium">Empresa</th>
      <th className="px-3 py-2 text-right font-medium">Vencimento</th>
      <th className="px-3 py-2 text-right font-medium">Atraso</th>
      <th className="px-3 py-2 text-right font-medium">Saldo</th>
      <th className="px-3 py-2 text-left font-medium">Descrição bancária</th>
      <th className="px-3 py-2 text-left font-medium">Vendedor</th>
    </tr>
  );

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-label text-on-surface-variant">
            Empresa
            <select value={f.empresa ?? ''} onChange={(e) => muda({ empresa: e.target.value })} className={seletor}>
              <option value="">Todas</option>
              {opcoes.empresas.map(([id, nome]) => (
                <option key={id} value={id}>
                  {nome}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-label text-on-surface-variant">
            Carteira
            <select value={f.tipo ?? ''} onChange={(e) => muda({ tipo: e.target.value as Filtros['tipo'], fidc: '' })} className={seletor}>
              <option value="">Todas</option>
              {TIPOS_CARTEIRA.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.rotulo}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-label text-on-surface-variant">
            FIDC
            <select value={f.fidc ?? ''} onChange={(e) => muda({ fidc: e.target.value, tipo: e.target.value ? 'fidc' : f.tipo })} className={seletor}>
              <option value="">Todas</option>
              {opcoes.fidcs.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-label text-on-surface-variant">
            Atraso
            <select value={f.faixa ?? ''} onChange={(e) => muda({ faixa: e.target.value as Filtros['faixa'] })} className={seletor}>
              <option value="">Todos</option>
              {FAIXAS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.rotulo}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-label text-on-surface-variant">
            Região
            <select value={f.regiao ?? ''} onChange={(e) => muda({ regiao: e.target.value, vendedor: '' })} className={seletor}>
              <option value="">Todas</option>
              {opcoes.regioes.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-label text-on-surface-variant">
            Vendedor (código ou nome)
            <input
              list="lista-vendedores"
              value={textoVendedor}
              onChange={(e) => {
                setTextoVendedor(e.target.value);
                const v = e.target.value.trim();
                const cod = v.split('·')[0].trim();
                // código digitado ou escolhido na lista
                const achado = opcoes.vendedores.find(([c]) => c === cod) ?? opcoes.vendedores.find(([, n]) => n.toUpperCase() === v.toUpperCase());
                muda({ vendedor: achado ? achado[0] : '' });
              }}
              placeholder="ex.: 1776 ou SOLANGE"
              className={`${seletor} w-60`}
            />
            <datalist id="lista-vendedores">
              {opcoes.vendedores
                .filter(([cod]) => !f.regiao || titulos.some((t) => t.vendedorCod === cod && t.regiao === f.regiao))
                .map(([cod, nome]) => (
                  <option key={cod} value={`${cod} · ${nome}`} />
                ))}
            </datalist>
          </label>
          <label className="flex flex-col text-label text-on-surface-variant">
            Cliente, CNPJ, documento ou cidade
            <input value={f.busca ?? ''} onChange={(e) => muda({ busca: e.target.value })} placeholder="buscar…" className={`${seletor} w-56`} />
          </label>
          {Object.values(f).some(Boolean) && (
            <button
              type="button"
              onClick={() => {
                muda({ empresa: '', tipo: '', fidc: '', faixa: '', vendedor: '', regiao: '', busca: '' });
                setTextoVendedor('');
              }}
              className="h-9 px-2 text-body-sm text-primary"
            >
              Limpar filtros
            </button>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <Link href={incluirGrupo ? '/admin/inadimplencia' : '/admin/inadimplencia?grupo=1'} className="text-body-sm text-primary hover:underline">
              {incluirGrupo ? 'Tirar vendas entre empresas do grupo' : 'Incluir vendas entre empresas do grupo'}
            </Link>
            <a
              href={linkCobranca({})}
              title="Uma aba por vendedor no modelo da cobrança (INAD <VENDEDOR>) + aba FINAL com os totais"
              className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-body-sm font-medium text-on-primary hover:bg-primary/90"
            >
              Baixar planilha da cobrança
            </a>
            <a
              href={`/api/inadimplencia/exportar?${params.toString()}`}
              className="inline-flex h-9 items-center rounded-md border border-primary px-3 text-body-sm font-medium text-primary hover:bg-primary/5"
            >
              Excel completo
            </a>
          </div>
        </div>
        <p className="mt-2 text-label text-on-surface-variant">
          Direto do ORGM, atualizado ao abrir a página. {incluirGrupo ? 'Incluindo' : 'Sem'} as vendas entre empresas do grupo (Biosense → Roma, Veneza…).
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Indicador rotulo="Total vencido" valor={curto(total)} detalhe={moeda(total)} alerta={total > 0} />
        <Indicador rotulo="Títulos" valor={lista.length.toLocaleString('pt-BR')} detalhe={`${clientes.toLocaleString('pt-BR')} clientes`} />
        <Indicador rotulo="Em FIDC" valor={curto(emFidc)} detalhe={total ? `${pct(emFidc / total)} do vencido · risco de recompra` : '—'} />
        <Indicador rotulo="Mais de 90 dias" valor={curto(mais90)} detalhe={total ? `${pct(mais90 / total)} do vencido` : '—'} />
        <Indicador rotulo="Maior atraso" valor={lista.length ? `${Math.max(...lista.map((t) => t.dias)).toLocaleString('pt-BR')} dias` : '—'} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-2 text-h2 text-on-surface">Tempo de atraso</h2>
          <Barras itens={porFaixa} ativo={f.faixa} onClicar={(id) => muda({ faixa: f.faixa === id ? '' : (id as Filtros['faixa']) })} />
          <p className="mt-2 text-label text-on-surface-variant">Clique numa faixa para filtrar.</p>
        </Card>
        <Card className="p-4">
          <h2 className="mb-2 text-h2 text-on-surface">Onde está o título</h2>
          <Barras itens={porTipo} ativo={f.tipo} onClicar={(id) => muda({ tipo: f.tipo === id ? '' : (id as Filtros['tipo']), fidc: '' })} />
          {opcoes.fidcs.length > 0 && (
            <div className="mt-3 border-t border-border-muted pt-3">
              <p className="mb-1 text-label uppercase text-on-surface-variant">Vencido em cada FIDC</p>
              <Barras
                itens={opcoes.fidcs
                  .map((x) => {
                    const ts = filtrar(titulos, { ...f, fidc: x, tipo: 'fidc' });
                    return { id: x, rotulo: x, valor: soma(ts), qtd: ts.length, cor: COR_TIPO.fidc };
                  })
                  .filter((x) => x.qtd)
                  .sort((a, b) => b.valor - a.valor)}
                ativo={f.fidc}
                onClicar={(id) => muda({ fidc: f.fidc === id ? '' : id, tipo: f.fidc === id ? f.tipo : 'fidc' })}
              />
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <h2 className="text-h2 text-on-surface">Vencido por mês de vencimento</h2>
          <p className="mb-2 text-label text-on-surface-variant">quanto do que está em aberto venceu em cada mês</p>
          <Colunas itens={porMes} cor="#dc2626" rotuloX={(k) => (k === 'antes' ? 'antes' : nomeMes(k))} />
        </Card>
        <Card className="p-4">
          <h2 className="text-h2 text-on-surface">Evolução do total vencido</h2>
          <p className="mb-2 text-label text-on-surface-variant">uma foto por dia, guardada quando alguém abre esta página (sem vendas entre empresas do grupo)</p>
          {evolucao.length >= 2 ? (
            <Colunas itens={evolucao} cor="#2563eb" rotuloX={(k) => `${k.slice(8, 10)}/${k.slice(5, 7)}`} />
          ) : (
            <p className="py-10 text-center text-body-sm text-on-surface-variant">A evolução começa a aparecer a partir de amanhã (a primeira foto foi guardada hoje).</p>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
          <h2 className="text-h2 text-on-surface">Por região</h2>
          <span className="text-label text-on-surface-variant">região pela UF do vendedor · clique para filtrar</span>
        </div>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-body-sm">
            <thead>
              <tr className="text-label uppercase text-on-surface-variant">
                <th className="px-4 py-2 text-left font-medium">Região</th>
                <th className="px-4 py-2 text-right font-medium">Vendedores</th>
                <th className="px-4 py-2 text-right font-medium">Títulos</th>
                <th className="px-4 py-2 text-right font-medium">Carteira</th>
                <th className="px-4 py-2 text-right font-medium">Recompra</th>
                <th className="px-4 py-2 text-right font-medium">FIDC</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {porRegiao.map((r) => (
                <tr
                  key={r.regiao}
                  className={`cursor-pointer border-t border-border-muted hover:bg-primary/5 ${f.regiao === r.regiao ? 'bg-primary/10' : ''}`}
                  onClick={() => muda({ regiao: f.regiao === r.regiao ? '' : r.regiao, vendedor: '' })}
                >
                  <td className="px-4 py-1.5 font-medium text-on-surface">{r.regiao}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{r.vendedores}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{r.qtd}</td>
                  <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums">{r.carteira ? moeda(r.carteira) : '—'}</td>
                  <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums">{r.recompra ? moeda(r.recompra) : '—'}</td>
                  <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums">{r.fidc ? moeda(r.fidc) : '—'}</td>
                  <td className="whitespace-nowrap px-4 py-1.5 text-right font-semibold tabular-nums">{moeda(r.total)}</td>
                  <td className="px-4 py-1.5 text-right">{botaoBaixar(linkCobranca({ regiao: r.regiao, vendedor: '' }), 'Baixar planilha da região')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
          <h2 className="text-h2 text-on-surface">Por vendedor ({porVendedor.length})</h2>
          <span className="text-label text-on-surface-variant">marque os vendedores e baixe tudo de uma vez · clique no nome para filtrar a tela</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-y border-border-muted bg-surface-container-low/60 px-4 py-3">
          <input
            value={buscaVend}
            onChange={(e) => setBuscaVend(e.target.value)}
            placeholder="Buscar vendedor por código ou nome…"
            className={`${seletor} w-64`}
          />
          <button
            type="button"
            onClick={() => setMarcadosVend((s) => new Set([...Array.from(s), ...vendVisiveis.map((v) => v.cod)]))}
            className="h-9 rounded-md border border-primary px-3 text-body-sm font-medium text-primary hover:bg-primary/5"
          >
            Marcar {buscaVend.trim() ? `os ${vendVisiveis.length} encontrados` : `todos (${porVendedor.length})`}
          </button>
          {marcadosVend.size > 0 && (
            <button type="button" onClick={() => setMarcadosVend(new Set())} className="h-9 px-2 text-body-sm text-primary">
              Desmarcar todos
            </button>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="text-body-sm text-on-surface">
              {selecionados.length
                ? `${selecionados.length} selecionado${selecionados.length === 1 ? '' : 's'} · ${moeda(totalSelecionado)}`
                : 'Nenhum vendedor marcado'}
            </span>
            <a
              href={selecionados.length ? linkSelecionados('abas', selecionados.map((v) => v.cod)) : undefined}
              aria-disabled={!selecionados.length}
              title="Um arquivo .xlsx: aba FINAL com os totais + uma aba por vendedor"
              className={`inline-flex h-9 items-center rounded-md px-3 text-body-sm font-medium ${
                selecionados.length ? 'bg-primary text-on-primary hover:bg-primary/90' : 'pointer-events-none bg-primary/40 text-on-primary'
              }`}
            >
              Baixar em um arquivo (abas)
            </a>
            <a
              href={selecionados.length > 1 ? linkSelecionados('zip', selecionados.map((v) => v.cod)) : undefined}
              aria-disabled={selecionados.length < 2}
              title="Um arquivo INAD <VENDEDOR>.xlsx para cada vendedor + INAD TOTAL, juntos num .zip"
              className={`inline-flex h-9 items-center rounded-md border px-3 text-body-sm font-medium ${
                selecionados.length > 1 ? 'border-primary text-primary hover:bg-primary/5' : 'pointer-events-none border-outline-variant text-outline'
              }`}
            >
              Baixar arquivos separados (.zip)
            </a>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="text-label uppercase text-on-surface-variant">
                <th className="w-8 py-2 pl-3" />
                <th className="w-10 px-4 py-2">
                  <input
                    type="checkbox"
                    aria-label="Marcar todos os vendedores da lista"
                    className="h-4 w-4 accent-primary"
                    checked={vendVisiveis.length > 0 && vendVisiveis.every((v) => marcadosVend.has(v.cod))}
                    onChange={(e) =>
                      setMarcadosVend((s) => {
                        const n = new Set(s);
                        vendVisiveis.forEach((v) => (e.target.checked ? n.add(v.cod) : n.delete(v.cod)));
                        return n;
                      })
                    }
                  />
                </th>
                <th className="px-4 py-2 text-left font-medium">Cód.</th>
                <th className="px-4 py-2 text-left font-medium">Vendedor</th>
                <th className="px-4 py-2 text-left font-medium">Região</th>
                <th className="px-4 py-2 text-right font-medium">Títulos</th>
                <th className="px-4 py-2 text-right font-medium">Carteira</th>
                <th className="px-4 py-2 text-right font-medium">Recompra</th>
                <th className="px-4 py-2 text-right font-medium">FIDC</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {vendNaTela.map((v) => (
                <Fragment key={v.cod}>
                <tr
                  className={`cursor-pointer border-t border-border-muted hover:bg-primary/5 ${f.vendedor === v.cod ? 'bg-primary/10' : marcadosVend.has(v.cod) || vendAberto === v.cod ? 'bg-primary/5' : ''}`}
                  onClick={() => v.cod !== 'SEM' && escolherVendedor(v.cod, v.nome)}
                >
                  <td className="py-1.5 pl-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setVendAberto(vendAberto === v.cod ? null : v.cod)}
                      aria-expanded={vendAberto === v.cod}
                      aria-label={`${vendAberto === v.cod ? 'Fechar' : 'Abrir'} a planilha de ${v.nome}`}
                      title={vendAberto === v.cod ? 'Fechar' : 'Ver a planilha na tela'}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-primary hover:bg-primary/10"
                    >
                      <svg viewBox="0 0 20 20" className={`h-4 w-4 transition-transform ${vendAberto === v.cod ? 'rotate-90' : ''}`} fill="currentColor" aria-hidden>
                        <path d="M7 4l7 6-7 6V4z" />
                      </svg>
                    </button>
                  </td>
                  <td className="px-4 py-1.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Marcar ${v.nome}`}
                      className="h-4 w-4 accent-primary"
                      checked={marcadosVend.has(v.cod)}
                      onChange={() => alternarVend(v.cod)}
                    />
                  </td>
                  <td className="px-4 py-1.5 tabular-nums text-on-surface-variant">{v.cod === 'SEM' ? '—' : v.cod}</td>
                  <td className="px-4 py-1.5 font-medium text-on-surface">{v.nome}</td>
                  <td className="px-4 py-1.5 text-on-surface-variant">{v.regiao}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{v.ts.length}</td>
                  <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums">{v.carteira ? moeda(v.carteira) : '—'}</td>
                  <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums">{v.recompra ? moeda(v.recompra) : '—'}</td>
                  <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums">{v.fidc ? moeda(v.fidc) : '—'}</td>
                  <td className="whitespace-nowrap px-4 py-1.5 text-right font-semibold tabular-nums">{moeda(v.total)}</td>
                  <td className="px-4 py-1.5 text-right">{botaoBaixar(linkSelecionados('abas', [v.cod]), 'Baixar só este')}</td>
                </tr>
                {vendAberto === v.cod && (
                  <tr className="bg-surface-container-low/60">
                    <td colSpan={11} className="p-3">
                      <PlanilhaVendedor nome={v.nome} ts={v.ts} />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {!buscaVend.trim() && porVendedor.length > 15 && (
          <div className="px-4 py-3">
            <button type="button" onClick={() => setVerTodosVendedores((x) => !x)} className="text-body-sm text-primary">
              {verTodosVendedores ? 'Mostrar só os 15 maiores' : `Ver todos os ${porVendedor.length} vendedores`}
            </button>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <h2 className="px-4 pt-4 text-h2 text-on-surface">Por empresa</h2>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-body-sm">
            <thead>
              <tr className="text-label uppercase text-on-surface-variant">
                <th className="px-4 py-2 text-left font-medium">Empresa</th>
                <th className="px-4 py-2 text-right font-medium">Títulos</th>
                {FAIXAS.map((x) => (
                  <th key={x.id} className="whitespace-nowrap px-3 py-2 text-right font-medium">
                    {x.rotulo}
                  </th>
                ))}
                <th className="px-4 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {porEmpresa.map((e) => (
                <tr key={e.id} className="cursor-pointer border-t border-border-muted hover:bg-primary/5" onClick={() => muda({ empresa: f.empresa === e.id ? '' : e.id })}>
                  <td className="px-4 py-1.5 font-medium text-on-surface">{e.empresa}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{e.ts.length}</td>
                  {FAIXAS.map((x) => {
                    const v = soma(e.ts.filter((t) => faixaDe(t.dias) === x.id));
                    return (
                      <td key={x.id} className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-on-surface-variant">
                        {v ? moeda(v) : '—'}
                      </td>
                    );
                  })}
                  <td className="whitespace-nowrap px-4 py-1.5 text-right font-semibold tabular-nums">{moeda(e.total)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-border-muted bg-surface-container-low font-semibold">
                <td className="px-4 py-2">Total</td>
                <td className="px-4 py-2 text-right tabular-nums">{lista.length}</td>
                {FAIXAS.map((x) => (
                  <td key={x.id} className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {moeda(soma(lista.filter((t) => faixaDe(t.dias) === x.id)))}
                  </td>
                ))}
                <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{moeda(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
          <h2 className="text-h2 text-on-surface">Clientes que mais devem</h2>
          <span className="text-label text-on-surface-variant">30 maiores · clique para ver os títulos</span>
        </div>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-body-sm">
            <thead>
              <tr className="text-label uppercase text-on-surface-variant">
                <th className="px-4 py-2 text-left font-medium">Cliente</th>
                <th className="px-4 py-2 text-left font-medium">Empresa</th>
                <th className="px-4 py-2 text-right font-medium">Títulos</th>
                <th className="px-4 py-2 text-right font-medium">Maior atraso</th>
                <th className="px-4 py-2 text-right font-medium">Total vencido</th>
                <th className="px-4 py-2 text-right font-medium">% do vencido</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((c) => (
                <Fragment key={c.k}>
                  <tr className="cursor-pointer border-t border-border-muted hover:bg-primary/5" onClick={() => setClienteAberto(clienteAberto === c.k ? null : c.k)}>
                    <td className="px-4 py-1.5">
                      <span className="mr-1 inline-block w-3 text-on-surface-variant">{clienteAberto === c.k ? '▾' : '▸'}</span>
                      <span className="font-medium text-on-surface">{c.cliente}</span>
                      <span className="ml-1 text-label text-on-surface-variant">{c.cnpj}</span>
                    </td>
                    <td className="px-4 py-1.5 text-on-surface-variant">{c.empresa}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums">{c.ts.length}</td>
                    <td className={`px-4 py-1.5 text-right tabular-nums ${c.maior > 90 ? 'text-error' : ''}`}>{c.maior} d</td>
                    <td className="whitespace-nowrap px-4 py-1.5 text-right font-semibold tabular-nums">{moeda(c.total)}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums text-on-surface-variant">{total ? pct(c.total / total) : '—'}</td>
                  </tr>
                  {clienteAberto === c.k && (
                    <tr className="bg-surface-container-low/60">
                      <td colSpan={6} className="p-3">
                        <div className="overflow-x-auto rounded-md border border-border-muted bg-surface-container-lowest">
                          <table className="w-full text-body-sm">
                            <thead>{cabecalhoTitulos}</thead>
                            <tbody>{[...c.ts].sort((a, b) => b.dias - a.dias).map(tituloLinha)}</tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
          <h2 className="text-h2 text-on-surface">Títulos vencidos ({lista.length.toLocaleString('pt-BR')})</h2>
          <label className="flex items-center gap-2 text-label text-on-surface-variant">
            Ordenar por
            <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} className={seletor}>
              <option value="dias">Mais atrasados</option>
              <option value="saldo">Maior valor</option>
              <option value="vencimento">Vencimento</option>
              <option value="cliente">Cliente</option>
            </select>
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-body-sm">
            <thead>{cabecalhoTitulos}</thead>
            <tbody>{ordenada.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA).map(tituloLinha)}</tbody>
          </table>
        </div>
        {paginas > 1 && (
          <div className="flex items-center justify-end gap-3 px-4 py-3 text-body-sm">
            <button type="button" disabled={!pagina} onClick={() => setPagina((p) => p - 1)} className="text-primary disabled:text-outline">
              ‹ Anterior
            </button>
            <span className="text-on-surface-variant">
              página {pagina + 1} de {paginas}
            </span>
            <button type="button" disabled={pagina >= paginas - 1} onClick={() => setPagina((p) => p + 1)} className="text-primary disabled:text-outline">
              Próxima ›
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
