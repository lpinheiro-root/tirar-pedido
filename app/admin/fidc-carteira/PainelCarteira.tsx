'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ImportarBordero } from '@/app/admin/fidc/PainelFidc';
import type { ResumoConferencia, Situacao, TituloConferido } from '@/lib/fidc/carteira';

export interface BorderoLista {
  id: number;
  data: string;
  fidc: string;
  empresa: string;
  numero: string;
  qtd_titulos: number;
  bruto: number;
  liquido: number;
  arquivo: string | null;
  usuario_nome: string | null;
  atualizado_em: string;
}

type Resumo = ResumoConferencia | { erro: string };

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—');
const seletor = 'h-9 rounded-md border border-[#D1D5DB] bg-surface-container-lowest px-2 text-body-sm text-on-surface';

const SITUACAO: Record<Situacao, { rotulo: string; classe: string; icone: string }> = {
  ok: { rotulo: 'Carteira certa', classe: 'bg-green-100 text-green-800', icone: '✓' },
  falta: { rotulo: 'Falta trocar', classe: 'bg-amber-100 text-amber-900', icone: '!' },
  outra: { rotulo: 'Outra carteira', classe: 'bg-error-container text-error-on-container', icone: '✕' },
  nao_achado: { rotulo: 'Não achei no ORGM', classe: 'bg-error-container text-error-on-container', icone: '?' },
};

function Selo({ s }: { s: Situacao }) {
  const x = SITUACAO[s];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-2 py-0.5 text-label font-medium ${x.classe}`}>
      <span aria-hidden>{x.icone}</span>
      {x.rotulo}
    </span>
  );
}

function SeloResumo({ r }: { r: Resumo | undefined }) {
  if (!r) return <span className="text-label text-on-surface-variant">conferindo…</span>;
  if ('erro' in r) return <span className="text-label text-error">{r.erro}</span>;
  if (!r.total) return <span className="text-label text-on-surface-variant">borderô sem títulos — importe de novo</span>;
  if (r.ok === r.total)
    return (
      <span className="inline-flex items-center gap-1 rounded-sm bg-green-100 px-2 py-0.5 text-label font-medium text-green-800">
        ✓ {r.ok}/{r.total} conferidos{r.avisos ? ` · ${r.avisos} com aviso` : ''}
      </span>
    );
  const partes = [
    r.falta && `${r.falta} falta trocar`,
    r.outra && `${r.outra} em outra carteira`,
    r.naoAchado && `${r.naoAchado} não achados`,
  ].filter(Boolean);
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-amber-100 px-2 py-0.5 text-label font-medium text-amber-900">
      ! {r.ok}/{r.total} ok · {partes.join(' · ')}
    </span>
  );
}

function Detalhe({ id, onResumo }: { id: number; onResumo: (r: Resumo) => void }) {
  const [titulos, setTitulos] = useState<TituloConferido[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [soPendentes, setSoPendentes] = useState(false);
  const [vez, setVez] = useState(0);

  useEffect(() => {
    let vivo = true;
    setTitulos(null);
    setErro(null);
    fetch(`/api/fidc/carteira?id=${id}`)
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        if (j.erro) setErro(j.erro);
        else {
          setTitulos(j.titulos);
          const ts = j.titulos as TituloConferido[];
          onResumo({
            total: ts.length,
            ok: ts.filter((t) => t.situacao === 'ok').length,
            falta: ts.filter((t) => t.situacao === 'falta').length,
            outra: ts.filter((t) => t.situacao === 'outra').length,
            naoAchado: ts.filter((t) => t.situacao === 'nao_achado').length,
            avisos: ts.filter((t) => t.avisos.length).length,
          });
        }
      })
      .catch(() => vivo && setErro('Falha de conexão com o servidor.'));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, vez]);

  if (erro) return <p className="p-3 text-body-sm text-error">{erro}</p>;
  if (!titulos) return <p className="p-3 text-body-sm text-on-surface-variant">Conferindo os títulos no ORGM…</p>;
  const lista = soPendentes ? titulos.filter((t) => t.situacao !== 'ok' || t.avisos.length) : titulos;

  return (
    <div className="space-y-2 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 text-body-sm text-on-surface">
          <input type="checkbox" className="h-4 w-4 accent-primary" checked={soPendentes} onChange={(e) => setSoPendentes(e.target.checked)} />
          Só o que precisa olhar
        </label>
        <Button size="sm" variant="secondary" onClick={() => setVez((v) => v + 1)}>
          Conferir de novo
        </Button>
        <span className="text-label text-on-surface-variant">Depois de trocar a carteira no ORGM, clique em “Conferir de novo”.</span>
      </div>
      <div className="max-h-[520px] overflow-auto rounded-md border border-border-muted bg-surface-container-lowest">
        <table className="w-full text-body-sm">
          <thead className="sticky top-0 bg-surface-container-lowest">
            <tr className="text-label uppercase text-on-surface-variant">
              <th className="px-3 py-2 text-left font-medium">Título (borderô)</th>
              <th className="px-3 py-2 text-left font-medium">Doc. ORGM</th>
              <th className="px-3 py-2 text-left font-medium">Sacado</th>
              <th className="px-3 py-2 text-right font-medium">Vencimento</th>
              <th className="px-3 py-2 text-right font-medium">Valor</th>
              <th className="px-3 py-2 text-left font-medium">Carteira no ORGM</th>
              <th className="px-3 py-2 text-left font-medium">Situação</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((t) => (
              <tr key={t.ordem} className="border-t border-border-muted align-top">
                <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{t.numero}</td>
                <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-on-surface-variant">
                  {t.documento ?? '—'}
                  {t.empresaId ? <span className="ml-1 text-label">(emp. {t.empresaId})</span> : null}
                </td>
                <td className="px-3 py-1.5">{t.sacado}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                  {br(t.vencimento)}
                  {t.vencimentoOrgm && t.vencimentoOrgm !== t.vencimento && <div className="text-label text-amber-800">ORGM {br(t.vencimentoOrgm)}</div>}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                  {moeda(t.valor)}
                  {t.valorOrgm != null && Math.abs(t.valorOrgm - t.valor) >= 0.05 && <div className="text-label text-amber-800">ORGM {moeda(t.valorOrgm)}</div>}
                </td>
                <td className="px-3 py-1.5">
                  {t.carteira ? (
                    <>
                      <span className="text-on-surface">{t.carteira}</span>
                      <span className="ml-1 text-label text-on-surface-variant">{t.carteiraCod}</span>
                    </>
                  ) : (
                    <span className="text-on-surface-variant">—</span>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  <Selo s={t.situacao} />
                  {t.avisos.map((a) => (
                    <div key={a} className="mt-0.5 text-label text-amber-800">
                      {a}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
            {!lista.length && (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-on-surface-variant">
                  Nada pendente neste borderô.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PainelCarteira({ borderos }: { borderos: BorderoLista[] }) {
  const [importando, setImportando] = useState(false);
  const [fidc, setFidc] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [mes, setMes] = useState('');
  const [situacao, setSituacao] = useState<'todos' | 'pendentes' | 'ok'>('todos');
  const [aberto, setAberto] = useState<number | null>(null);
  const [resumos, setResumos] = useState<Record<number, Resumo>>({});

  const fidcs = useMemo(() => Array.from(new Set(borderos.map((b) => b.fidc))).sort(), [borderos]);
  const empresas = useMemo(() => Array.from(new Set(borderos.map((b) => b.empresa))).sort(), [borderos]);
  const meses = useMemo(() => Array.from(new Set(borderos.map((b) => b.data.slice(0, 7)))).sort().reverse(), [borderos]);

  const filtrados = borderos.filter((b) => (!fidc || b.fidc === fidc) && (!empresa || b.empresa === empresa) && (!mes || b.data.startsWith(mes)));
  const pendente = (r: Resumo | undefined) => !r || 'erro' in r || r.ok !== r.total || !r.total;
  const visiveis = filtrados.filter((b) => situacao === 'todos' || (situacao === 'pendentes' ? pendente(resumos[b.id]) : !pendente(resumos[b.id])));

  // confere no ORGM os borderôs que aparecem (aos poucos, 10 por vez)
  const idsFaltando = filtrados
    .map((b) => b.id)
    .filter((id) => !resumos[id])
    .slice(0, 10);
  const chave = idsFaltando.join(',');
  const buscar = useCallback(async (ids: string) => {
    try {
      const r = await fetch(`/api/fidc/carteira?ids=${ids}`);
      const j = await r.json();
      if (j.resumos) setResumos((x) => ({ ...x, ...j.resumos }));
      else if (j.erro) setResumos((x) => ({ ...x, ...Object.fromEntries(ids.split(',').map((i) => [i, { erro: j.erro }])) }));
    } catch {
      setResumos((x) => ({ ...x, ...Object.fromEntries(ids.split(',').map((i) => [i, { erro: 'Falha de conexão.' }])) }));
    }
  }, []);
  useEffect(() => {
    if (chave) buscar(chave);
  }, [chave, buscar]);

  const conferidos = filtrados.map((b) => resumos[b.id]).filter((r): r is ResumoConferencia => Boolean(r) && !('erro' in r!));
  const tot = {
    titulos: conferidos.reduce((s, r) => s + r.total, 0),
    ok: conferidos.reduce((s, r) => s + r.ok, 0),
    falta: conferidos.reduce((s, r) => s + r.falta, 0),
    outra: conferidos.reduce((s, r) => s + r.outra + r.naoAchado, 0),
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Button onClick={() => setImportando((v) => !v)}>Importar borderô (PDF)</Button>
          <label className="flex flex-col text-label text-on-surface-variant">
            FIDC
            <select value={fidc} onChange={(e) => setFidc(e.target.value)} className={seletor}>
              <option value="">Todas</option>
              {fidcs.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-label text-on-surface-variant">
            Empresa
            <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} className={seletor}>
              <option value="">Todas</option>
              {empresas.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-label text-on-surface-variant">
            Mês
            <select value={mes} onChange={(e) => setMes(e.target.value)} className={seletor}>
              <option value="">Todos</option>
              {meses.map((m) => (
                <option key={m} value={m}>
                  {m.slice(5, 7)}/{m.slice(0, 4)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-1">
            {(
              [
                ['todos', 'Todos'],
                ['pendentes', 'Com pendência'],
                ['ok', 'Tudo certo'],
              ] as const
            ).map(([v, r]) => (
              <button
                key={v}
                onClick={() => setSituacao(v)}
                className={`h-9 rounded-md px-3 text-body-sm ${situacao === v ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface hover:bg-primary/10'}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        {importando && (
          <div className="mt-3">
            <ImportarBordero />
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-label uppercase text-on-surface-variant">Borderôs</p>
          <p className="mt-1 text-h2 tabular-nums text-on-surface">{filtrados.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-label uppercase text-on-surface-variant">Títulos com carteira certa</p>
          <p className="mt-1 text-h2 tabular-nums text-on-surface">
            {tot.ok}
            <span className="text-body text-on-surface-variant"> / {tot.titulos}</span>
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-label uppercase text-on-surface-variant">Falta trocar a carteira</p>
          <p className={`mt-1 text-h2 tabular-nums ${tot.falta ? 'text-amber-800' : 'text-on-surface'}`}>{tot.falta}</p>
        </Card>
        <Card className="p-4">
          <p className="text-label uppercase text-on-surface-variant">Outra carteira / não achados</p>
          <p className={`mt-1 text-h2 tabular-nums ${tot.outra ? 'text-error' : 'text-on-surface'}`}>{tot.outra}</p>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="text-label uppercase text-on-surface-variant">
                <th className="px-4 py-2 text-left font-medium">Data</th>
                <th className="px-4 py-2 text-left font-medium">FIDC · Empresa</th>
                <th className="px-4 py-2 text-left font-medium">Borderô</th>
                <th className="px-4 py-2 text-right font-medium">Títulos</th>
                <th className="px-4 py-2 text-right font-medium">Valor</th>
                <th className="px-4 py-2 text-left font-medium">Conferência no ORGM</th>
                <th className="px-4 py-2 text-left font-medium">Importado por</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((b) => (
                <Fragment key={b.id}>
                  <tr className="cursor-pointer border-t border-border-muted hover:bg-primary/5" onClick={() => setAberto(aberto === b.id ? null : b.id)}>
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums">
                      <span className="mr-1 inline-block w-3 text-on-surface-variant">{aberto === b.id ? '▾' : '▸'}</span>
                      {br(b.data)}
                    </td>
                    <td className="px-4 py-2 font-medium text-on-surface">
                      {b.fidc} · {b.empresa}
                    </td>
                    <td className="px-4 py-2 tabular-nums">nº {b.numero}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{b.qtd_titulos}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{moeda(b.bruto)}</td>
                    <td className="px-4 py-2">
                      <SeloResumo r={resumos[b.id]} />
                    </td>
                    <td className="px-4 py-2 text-on-surface-variant">{b.usuario_nome ?? '—'}</td>
                  </tr>
                  {aberto === b.id && (
                    <tr className="bg-surface-container-low/60">
                      <td colSpan={7}>
                        <Detalhe id={b.id} onResumo={(r) => setResumos((x) => ({ ...x, [b.id]: r }))} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {!visiveis.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-on-surface-variant">
                    {borderos.length ? 'Nenhum borderô com esse filtro.' : 'Nenhum borderô importado ainda. Clique em “Importar borderô (PDF)”.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
