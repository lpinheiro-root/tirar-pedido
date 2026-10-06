'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconDownload } from '@/components/ui/Icons';
import type { Conciliado, ResultadoConciliacao } from '@/lib/ecommerce/tipos';

interface Arquivo {
  nome: string;
  base64: string;
}
interface Resposta {
  resultado: ResultadoConciliacao;
  relatorio: Arquivo;
  fluxo: (Arquivo & { aba: string; coluna: string; gravados: { dia: string; antes: number | null; depois: number }[] }) | null;
}

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—');
const conta = (empresa: string, numero: string) => `${empresa.split(' ')[0]} ${numero.slice(-4)}`;

function baixar({ nome, base64 }: Arquivo, tipo: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function mesAnterior() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const campoArquivo =
  'block w-full text-body-sm text-on-surface file:mr-3 file:h-9 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:text-body-sm file:font-medium file:text-primary hover:file:bg-primary/15';

function Situacao({ c }: { c: Conciliado }) {
  if (!c.banco) return <span className="rounded-sm bg-error-container px-2 py-0.5 text-label font-medium text-error-on-container">Não achado</span>;
  if (!c.diaFluxo) return <span className="rounded-sm bg-amber-100 px-2 py-0.5 text-label font-medium text-amber-800">Fora do período</span>;
  return (
    <span className="rounded-sm bg-green-100 px-2 py-0.5 text-label font-medium text-green-700">
      OK{c.diaFluxo !== c.banco.data ? ` · entra em ${br(c.diaFluxo).slice(0, 5)}` : ''}
    </span>
  );
}

export function ConciliacaoEcommerce() {
  const [mes, setMes] = useState(mesAnterior);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resposta, setResposta] = useState<Resposta | null>(null);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    setResposta(null);
    try {
      const r = await fetch('/api/ecommerce/conciliar', { method: 'POST', body: new FormData(e.currentTarget) });
      const json = await r.json().catch(() => ({ erro: 'Resposta inválida do servidor.' }));
      if (!r.ok || json.erro) setErro(json.erro ?? 'Não consegui conciliar.');
      else setResposta(json as Resposta);
    } catch {
      setErro('Falha de conexão com o servidor.');
    } finally {
      setEnviando(false);
    }
  }

  const r = resposta?.resultado;
  const canais = r ? Array.from(new Set(r.conciliados.map((c) => c.item.canal))) : [];
  const naoAchados = r?.conciliados.filter((c) => !c.banco) ?? [];

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <form onSubmit={enviar} className="space-y-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div>
              <label className="mb-1 block text-label text-on-surface-variant">Mês da conciliação</label>
              <input
                type="month"
                name="mes"
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                required
                className="h-9 rounded-md border border-[#D1D5DB] bg-surface-container-lowest px-2 text-body-sm text-on-surface"
              />
              <p className="mt-1 text-label text-on-surface-variant">
                Vai do dia 1º até o dia 1º do mês seguinte; o que cai no dia 1º seguinte entra no último dia útil do mês.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-label text-on-surface-variant">1. Extratos do banco (PDF do Santander, pode marcar vários)</label>
              <input type="file" name="extratos" accept=".pdf" multiple required className={campoArquivo} />
            </div>
            <div>
              <label className="mb-1 block text-label text-on-surface-variant">2. Planilha de recebimentos do e-commerce (.xlsx, uma aba por marketplace)</label>
              <input type="file" name="planilha" accept=".xlsx" required className={campoArquivo} />
            </div>
            <div>
              <label className="mb-1 block text-label text-on-surface-variant">3. Fluxo Financeiro (.xlsx, opcional: para preencher a coluna Creditos Ecommerce)</label>
              <input type="file" name="fluxo" accept=".xlsx" className={campoArquivo} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={enviando}>
              {enviando ? 'Conciliando…' : 'Conciliar'}
            </Button>
            {erro && <p className="text-body-sm text-error">{erro}</p>}
          </div>
        </form>
      </Card>

      {r && resposta && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { t: 'Total da planilha', v: moeda(r.totais.planilha), c: 'text-on-surface' },
              { t: `Conciliado (${r.conciliados.length - naoAchados.length})`, v: moeda(r.totais.conciliado), c: 'text-green-700' },
              { t: `Não encontrado (${naoAchados.length})`, v: moeda(r.totais.naoEncontrado), c: naoAchados.length ? 'text-error' : 'text-green-700' },
              {
                t: 'Total do CONSOLIDADO',
                v: r.planilha.totalConsolidado != null ? moeda(r.planilha.totalConsolidado) : '—',
                c:
                  r.planilha.totalConsolidado != null && Math.abs(r.planilha.totalConsolidado - r.totais.planilha) > 0.01
                    ? 'text-amber-700'
                    : 'text-on-surface',
              },
            ].map((k) => (
              <Card key={k.t} className="p-4">
                <p className="text-label uppercase text-on-surface-variant">{k.t}</p>
                <p className={`mt-1 text-h2 ${k.c}`}>{k.v}</p>
              </Card>
            ))}
          </div>

          <Card className="flex flex-wrap items-center gap-3 p-4">
            <Button type="button" onClick={() => baixar(resposta.relatorio, 'application/pdf')}>
              <IconDownload width={16} height={16} /> Relatório da conciliação (PDF)
            </Button>
            {resposta.fluxo && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => baixar(resposta.fluxo!, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
              >
                <IconDownload width={16} height={16} /> Fluxo Financeiro preenchido (Excel)
              </Button>
            )}
            <div className="text-label text-on-surface-variant">
              {r.extratos.map((e) => (
                <p key={e.arquivo}>
                  {e.arquivo}: {e.empresa} · conta {e.conta} · {e.periodo} · {e.lancamentos} lançamentos
                </p>
              ))}
            </div>
          </Card>

          {(r.planilha.avisos.length > 0 || (resposta.fluxo && resposta.fluxo.gravados.some((g) => g.antes !== null && Math.abs(g.antes - g.depois) > 0.005))) && (
            <Card className="space-y-1 border-amber-200 bg-amber-50 p-4 text-body-sm text-amber-900">
              {r.planilha.avisos.map((a) => (
                <p key={a}>⚠️ {a}</p>
              ))}
              {resposta.fluxo?.gravados
                .filter((g) => g.antes !== null && Math.abs(g.antes - g.depois) > 0.005)
                .map((g) => (
                  <p key={g.dia}>
                    Fluxo {br(g.dia)}: estava {moeda(g.antes!)} e ficou {moeda(g.depois)} (diferença {moeda(g.depois - g.antes!)}).
                  </p>
                ))}
            </Card>
          )}

          <Card>
            <div className="border-b border-border-muted px-4 py-3">
              <p className="text-h2 text-on-surface">Por canal</p>
              <p className="text-label text-on-surface-variant">Clique no canal para ver cada valor da planilha ao lado do crédito no extrato.</p>
            </div>
            {canais.map((canal) => {
              const lista = r.conciliados.filter((c) => c.item.canal === canal);
              const total = lista.reduce((s, c) => s + c.item.valor, 0);
              const achado = lista.filter((c) => c.banco).reduce((s, c) => s + c.item.valor, 0);
              const ok = Math.abs(total - achado) < 0.01;
              return (
                <details key={canal} className="border-b border-border-muted last:border-0">
                  <summary className="flex cursor-pointer items-center gap-4 px-4 py-3 hover:bg-surface-container-low/50">
                    <span className="w-48 font-medium text-on-surface">{canal}</span>
                    <span className="w-28 text-body-sm text-on-surface-variant">{lista.length} lançamento(s)</span>
                    <span className="w-36 text-right text-body-sm text-on-surface">{moeda(total)}</span>
                    <span className={`ml-auto rounded-sm px-2 py-0.5 text-label font-medium ${ok ? 'bg-green-100 text-green-700' : 'bg-error-container text-error-on-container'}`}>
                      {ok ? 'Tudo confere' : `Falta ${moeda(total - achado)}`}
                    </span>
                  </summary>
                  <div className="overflow-x-auto px-4 pb-4">
                    <table className="w-full text-left text-body-sm">
                      <thead className="text-label uppercase text-on-surface-variant">
                        <tr>
                          <th className="px-2 py-2 font-medium">Data</th>
                          <th className="px-2 py-2 font-medium">Referência</th>
                          <th className="px-2 py-2 text-right font-medium">Valor planilha</th>
                          <th className="px-2 py-2 font-medium">Conta</th>
                          <th className="px-2 py-2 font-medium">Data banco</th>
                          <th className="px-2 py-2 font-medium">Histórico no extrato</th>
                          <th className="px-2 py-2 text-right font-medium">Valor extrato</th>
                          <th className="px-2 py-2 font-medium">Situação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lista.map((c) => (
                          <tr key={c.item.id} className="border-t border-border-muted">
                            <td className="px-2 py-1.5 text-on-surface-variant">{br(c.item.data)}</td>
                            <td className="max-w-56 truncate px-2 py-1.5" title={c.item.referencia}>
                              {c.item.referencia}
                            </td>
                            <td className="px-2 py-1.5 text-right">{moeda(c.item.valor)}</td>
                            <td className="px-2 py-1.5 text-on-surface-variant">{c.banco ? conta(c.banco.empresa, c.banco.conta) : ''}</td>
                            <td className="px-2 py-1.5 text-on-surface-variant">{c.banco ? br(c.banco.data) : ''}</td>
                            <td className="max-w-72 truncate px-2 py-1.5 text-on-surface-variant" title={c.banco?.historico}>
                              {c.banco?.historico ?? ''}
                            </td>
                            <td className="px-2 py-1.5 text-right">{c.banco ? moeda(c.banco.valor) : ''}</td>
                            <td className="px-2 py-1.5">
                              <Situacao c={c} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              );
            })}
          </Card>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card className="p-4">
              <p className="text-h2 text-on-surface">Não encontrados no extrato ({naoAchados.length})</p>
              {naoAchados.length === 0 ? (
                <p className="mt-2 text-body-sm text-green-700">Todos os valores da planilha foram encontrados no extrato.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-body-sm">
                  {naoAchados.map((c) => (
                    <li key={c.item.id} className="rounded-md bg-error-container/40 p-2">
                      <p className="font-medium text-on-surface">
                        {c.item.canal} · {br(c.item.data)} · {moeda(c.item.valor)} · {c.item.referencia}
                      </p>
                      <p className="text-label text-on-surface-variant">
                        {c.sugestoes.length
                          ? 'Pode ser: ' +
                            c.sugestoes
                              .map((s) => `${br(s.banco.data).slice(0, 5)} ${conta(s.banco.empresa, s.banco.conta)} ${s.banco.historico} ${moeda(s.banco.valor)} (dif. ${moeda(s.diferenca)})`)
                              .join(' | ')
                          : 'Nenhum crédito parecido: pode não ter caído ainda, ter ido para outra conta/banco ou ter sido somado com outro repasse.'}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-4">
              <p className="text-h2 text-on-surface">No extrato, mas fora da planilha ({r.sobrasExtrato.length})</p>
              <p className="text-label text-on-surface-variant">
                Créditos de quem paga os marketplaces que não estão na planilha. Os do dia 1º costumam ser do mês anterior ou do seguinte.
              </p>
              <ul className="mt-2 divide-y divide-border-muted text-body-sm">
                {r.sobrasExtrato.map((s) => (
                  <li key={s.banco.id} className="flex gap-3 py-1.5">
                    <span className="w-12 text-on-surface-variant">{br(s.banco.data).slice(0, 5)}</span>
                    <span className="w-24 text-on-surface-variant">{conta(s.banco.empresa, s.banco.conta)}</span>
                    <span className="flex-1 truncate" title={s.banco.historico}>
                      {s.banco.historico}
                      <span className="block text-label text-on-surface-variant">mesmo pagador de {s.provavelCanal}</span>
                    </span>
                    <span className="text-right font-medium">{moeda(s.banco.valor)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card className="p-4">
            <p className="text-h2 text-on-surface">Créditos E-commerce por dia</p>
            <p className="text-label text-on-surface-variant">Valores que vão para a coluna Creditos Ecommerce do Fluxo Financeiro.</p>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-body-sm sm:grid-cols-3 lg:grid-cols-5">
              {r.porDia.map((d) => (
                <div key={d.dia} className="flex justify-between border-b border-border-muted py-1">
                  <span className="text-on-surface-variant">{br(d.dia).slice(0, 5)}</span>
                  <span className="font-medium text-on-surface">{moeda(d.valor)}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-right text-body font-medium text-on-surface">
              Total: {moeda(r.porDia.reduce((s, d) => s + d.valor, 0))}
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
