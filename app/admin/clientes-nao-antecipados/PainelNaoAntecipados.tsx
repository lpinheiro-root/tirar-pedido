'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { filtrar, periodoPadrao, type FiltrosNaoAntecipados, type TituloNaoAntecipado } from '@/lib/naoAntecipados/comum';

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—');
const limpa = (s: string) => s.replace(/\s+/g, ' ').trim();
const seletor = 'h-9 rounded-md border border-[#D1D5DB] bg-surface-container-lowest px-2 text-body-sm text-on-surface';

type Chave = 'finMovId' | 'empresa' | 'cliente' | 'contaNome' | 'valorOriginal' | 'saldo' | 'documento' | 'emissao' | 'vencimento' | 'vendedor';
type Ordem = { chave: Chave; desc: boolean };

function Indicador({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <Card className="p-4">
      <p className="text-label text-on-surface-variant">{rotulo}</p>
      <p className="mt-1 text-h2 font-semibold tabular-nums text-on-surface">{valor}</p>
      {detalhe && <p className="mt-0.5 text-label text-on-surface-variant">{detalhe}</p>}
    </Card>
  );
}

export function PainelNaoAntecipados({ titulos, de, ate }: { titulos: TituloNaoAntecipado[]; de: string; ate: string }) {
  const router = useRouter();
  const [periodo, setPeriodo] = useState({ de, ate });
  const [f, setF] = useState<FiltrosNaoAntecipados>({});
  const [visao, setVisao] = useState<'titulos' | 'clientes'>('titulos');
  const [ordem, setOrdem] = useState<Ordem>({ chave: 'finMovId', desc: false });
  const muda = (p: Partial<FiltrosNaoAntecipados>) => setF((x) => ({ ...x, ...p }));

  const opcoes = useMemo(() => {
    const unicos = (k: (t: TituloNaoAntecipado) => string) =>
      Array.from(new Set(titulos.map(k).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    return {
      empresas: unicos((t) => t.empresa),
      carteiras: unicos((t) => t.contaNome),
      vendedores: unicos((t) => t.vendedor),
    };
  }, [titulos]);

  const lista = useMemo(() => {
    const l = filtrar(titulos, f);
    const { chave, desc } = ordem;
    return [...l].sort((a, b) => {
      const x = a[chave] ?? '';
      const y = b[chave] ?? '';
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return desc ? -r : r;
    });
  }, [titulos, f, ordem]);

  const total = (k: 'valorOriginal' | 'valorPago' | 'saldo') => lista.reduce((s, t) => s + t[k], 0);
  const clientes = useMemo(() => {
    const m = new Map<string, { cod: string; nome: string; cnpj: string; qtd: number; original: number; saldo: number; proximo: string | null }>();
    for (const t of lista) {
      const c = m.get(t.clienteCod) ?? { cod: t.clienteCod, nome: limpa(t.cliente.replace(/^\s*\S+\s+-\s+/, '')), cnpj: t.cnpj, qtd: 0, original: 0, saldo: 0, proximo: null };
      c.qtd++;
      c.original += t.valorOriginal;
      c.saldo += t.saldo;
      if (t.vencimento && (!c.proximo || t.vencimento < c.proximo)) c.proximo = t.vencimento;
      m.set(t.clienteCod, c);
    }
    return Array.from(m.values()).sort((a, b) => b.saldo - a.saldo);
  }, [lista]);

  const params = new URLSearchParams();
  if (de) params.set('de', de);
  if (ate) params.set('ate', ate);
  Object.entries(f).forEach(([k, v]) => v && params.set(k, String(v)));

  const irPara = (p: { de?: string; ate?: string; todos?: boolean }) => {
    const q = new URLSearchParams();
    if (p.todos) q.set('todos', '1');
    else {
      if (p.de) q.set('de', p.de);
      if (p.ate) q.set('ate', p.ate);
    }
    router.push(`/admin/clientes-nao-antecipados${q.toString() ? `?${q}` : ''}`);
  };

  const Th = ({ chave, children, direita }: { chave: Chave; children: React.ReactNode; direita?: boolean }) => (
    <th className={`whitespace-nowrap px-3 py-2 font-medium ${direita ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-primary"
        onClick={() => setOrdem((o) => ({ chave, desc: o.chave === chave ? !o.desc : false }))}
      >
        {children}
        {ordem.chave === chave && <span aria-hidden>{ordem.desc ? '▼' : '▲'}</span>}
      </button>
    </th>
  );

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            irPara(periodo);
          }}
        >
          <label className="flex flex-col text-label text-on-surface-variant">
            Emissão de
            <input type="date" value={periodo.de} onChange={(e) => setPeriodo((p) => ({ ...p, de: e.target.value }))} className={seletor} />
          </label>
          <label className="flex flex-col text-label text-on-surface-variant">
            até
            <input type="date" value={periodo.ate} onChange={(e) => setPeriodo((p) => ({ ...p, ate: e.target.value }))} className={seletor} />
          </label>
          <button type="submit" className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-body-sm font-medium text-on-primary hover:bg-primary/90">
            Consultar
          </button>
          <button type="button" onClick={() => irPara(periodoPadrao())} className="h-9 px-2 text-body-sm text-primary hover:underline">
            Mês atual
          </button>
          <button type="button" onClick={() => irPara({ todos: true })} className="h-9 px-2 text-body-sm text-primary hover:underline">
            Todos em aberto
          </button>
          <div className="ml-auto">
            <a
              href={`/api/clientes-nao-antecipados/exportar?${params.toString()}`}
              className="inline-flex h-9 items-center rounded-md border border-primary px-3 text-body-sm font-medium text-primary hover:bg-primary/5"
            >
              Baixar Excel
            </a>
          </div>
        </form>

        <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-border-muted pt-3">
          <label className="flex flex-col text-label text-on-surface-variant">
            Empresa
            <select value={f.empresa ?? ''} onChange={(e) => muda({ empresa: e.target.value })} className={seletor}>
              <option value="">Todas</option>
              {opcoes.empresas.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-label text-on-surface-variant">
            Carteira (ContaNome)
            <select value={f.carteira ?? ''} onChange={(e) => muda({ carteira: e.target.value })} className={`${seletor} max-w-72`}>
              <option value="">Todas</option>
              {opcoes.carteiras.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-label text-on-surface-variant">
            Vendedor
            <select value={f.vendedor ?? ''} onChange={(e) => muda({ vendedor: e.target.value })} className={`${seletor} max-w-60`}>
              <option value="">Todos</option>
              {opcoes.vendedores.map((x) => (
                <option key={x} value={x}>
                  {limpa(x)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-label text-on-surface-variant">
            Venda
            <select value={f.venda ?? ''} onChange={(e) => muda({ venda: e.target.value as FiltrosNaoAntecipados['venda'] })} className={seletor}>
              <option value="">Todas</option>
              <option value="1">Sim (1)</option>
              <option value="0">Não (0)</option>
            </select>
          </label>
          <label className="flex flex-col text-label text-on-surface-variant">
            Cliente, CNPJ, documento ou histórico
            <input value={f.busca ?? ''} onChange={(e) => muda({ busca: e.target.value })} placeholder="buscar…" className={`${seletor} w-64`} />
          </label>
          {f.cliente && (
            <span className="inline-flex h-9 items-center gap-2 rounded-md bg-primary/10 px-3 text-body-sm text-primary">
              Cliente {f.cliente}
              <button type="button" aria-label="Tirar filtro do cliente" onClick={() => muda({ cliente: '' })}>
                ✕
              </button>
            </span>
          )}
          {Object.values(f).some(Boolean) && (
            <button type="button" onClick={() => setF({})} className="h-9 px-2 text-body-sm text-primary">
              Limpar filtros
            </button>
          )}
        </div>
        <p className="mt-2 text-label text-on-surface-variant">
          Direto do ORGM, atualizado ao abrir a página.{' '}
          {de || ate ? `Emissão de ${br(de || null)} até ${br(ate || null)}.` : 'Todos os títulos em aberto, de qualquer emissão.'} Para um cliente
          entrar ou sair desta lista, marque ou desmarque “Bloqueia antecipação CR” no cadastro dele no ORGM.
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Valor original" valor={moeda(total('valorOriginal'))} />
        <Indicador rotulo="Valor pago" valor={moeda(total('valorPago'))} />
        <Indicador rotulo="Saldo" valor={moeda(total('saldo'))} />
        <Indicador rotulo="Títulos" valor={lista.length.toLocaleString('pt-BR')} detalhe={`${clientes.length.toLocaleString('pt-BR')} clientes`} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex gap-1 border-b border-border-muted px-3 pt-3">
          {(
            [
              ['titulos', 'Títulos'],
              ['clientes', 'Por cliente'],
            ] as const
          ).map(([id, rotulo]) => (
            <button
              key={id}
              type="button"
              onClick={() => setVisao(id)}
              className={`rounded-t-md px-3 py-2 text-body-sm font-medium ${visao === id ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-primary'}`}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <div className="max-h-[70vh] overflow-auto">
          {visao === 'titulos' ? (
            <table className="w-full text-body-sm">
              <thead className="sticky top-0 z-10 bg-surface-container-low text-on-surface-variant">
                <tr>
                  <Th chave="finMovId">finMovID</Th>
                  <Th chave="empresa">Empresa</Th>
                  <Th chave="cliente">Cliente</Th>
                  <Th chave="contaNome">ContaNome</Th>
                  <th className="px-3 py-2 text-left font-medium">Histórico</th>
                  <Th chave="valorOriginal" direita>
                    Valor original
                  </Th>
                  <Th chave="saldo" direita>
                    Saldo
                  </Th>
                  <Th chave="documento">Docto</Th>
                  <Th chave="emissao">Emissão</Th>
                  <Th chave="vencimento">Vencimento</Th>
                  <th className="px-3 py-2 text-center font-medium">Venda</th>
                  <Th chave="vendedor">Vendedor</Th>
                </tr>
              </thead>
              <tbody>
                {lista.map((t) => (
                  <tr key={t.finMovId} className="border-t border-border-muted align-top hover:bg-surface-container-low/60">
                    <td className="px-3 py-1.5 tabular-nums text-on-surface-variant">{t.finMovId}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">{t.empresa}</td>
                    <td className="px-3 py-1.5">
                      <span className="font-medium text-on-surface">{limpa(t.cliente)}</span>
                      <span className="block text-label text-on-surface-variant">{t.cnpj}</span>
                    </td>
                    <td className="px-3 py-1.5 text-on-surface-variant">{t.contaNome || '—'}</td>
                    <td className="px-3 py-1.5 text-on-surface-variant">{limpa(t.historico)}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{moeda(t.valorOriginal)}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-medium tabular-nums">{moeda(t.saldo)}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{t.documento}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{br(t.emissao)}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{br(t.vencimento)}</td>
                    <td className="px-3 py-1.5 text-center">{t.venda}</td>
                    <td className="px-3 py-1.5 text-on-surface-variant">{limpa(t.vendedor) || '—'}</td>
                  </tr>
                ))}
                {!lista.length && (
                  <tr>
                    <td colSpan={12} className="px-3 py-8 text-center text-on-surface-variant">
                      Nenhum título em aberto nesse período e filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-body-sm">
              <thead className="sticky top-0 z-10 bg-surface-container-low text-on-surface-variant">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Cód.</th>
                  <th className="px-3 py-2 text-left font-medium">Cliente</th>
                  <th className="px-3 py-2 text-left font-medium">CNPJ</th>
                  <th className="px-3 py-2 text-right font-medium">Títulos</th>
                  <th className="px-3 py-2 text-right font-medium">Valor original</th>
                  <th className="px-3 py-2 text-right font-medium">Saldo</th>
                  <th className="px-3 py-2 text-left font-medium">Próximo vencimento</th>
                </tr>
              </thead>
              <tbody>
                {clientes.map((c) => (
                  <tr
                    key={c.cod}
                    className="cursor-pointer border-t border-border-muted hover:bg-surface-container-low/60"
                    title="Ver os títulos deste cliente"
                    onClick={() => {
                      muda({ cliente: c.cod });
                      setVisao('titulos');
                    }}
                  >
                    <td className="px-3 py-1.5 tabular-nums text-on-surface-variant">{c.cod}</td>
                    <td className="px-3 py-1.5 font-medium text-on-surface">{c.nome}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-on-surface-variant">{c.cnpj}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{c.qtd}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{moeda(c.original)}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-medium tabular-nums">{moeda(c.saldo)}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{br(c.proximo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
