'use client';

import { Fragment, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import {
  MESES,
  NOME_RUBRICA,
  RUBRICAS,
  type Ajuste,
  type ContaMes,
  type Mensal,
  type Pagamento,
} from '@/lib/gerencial/rubricas';
import { calcular, soma, zeros, type CampoMensal } from '@/lib/gerencial/calculo';
import { criarAjuste, definirRubrica, detalheConta, excluirAjuste, salvarMensal, salvarParametro } from './actions';

const n0 = (v: number) => (Math.abs(v) < 0.5 ? '–' : v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }));
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v: number) => (Number.isFinite(v) ? `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '–');
const CAMPOS: { id: CampoMensal; rotulo: string }[] = [
  { id: 'faturamento', rotulo: 'Faturamento (base do % s/ fat.)' },
  { id: 'fat_off', rotulo: 'Natuhair OFF' },
  { id: 'fat_terceiros', rotulo: 'Natuhair terceiros (Zarb)' },
  { id: 'fat_ecommerce', rotulo: 'E-commerce' },
  { id: 'fat_exportacao', rotulo: 'Exportação' },
  { id: 'recebimento', rotulo: 'Recebimento (mapa dos círculos)' },
  { id: 'cheque_especial', rotulo: 'Cheque especial' },
];

export function PainelGerencial({
  ano,
  anoAtual,
  ultimoMesFechado,
  contas,
  mensal,
  ajustes,
  depara,
  parametros,
}: {
  ano: number;
  anoAtual: number;
  ultimoMesFechado: number;
  contas: ContaMes[];
  mensal: Mensal[];
  ajustes: Ajuste[];
  depara: Record<string, string>;
  parametros: Record<string, number>;
}) {
  const [aberta, setAberta] = useState<string | null>(null);
  const [semAberta, setSemAberta] = useState<string | null>(null);
  const [editarMes, setEditarMes] = useState<number | null>(null);
  const [novoAjuste, setNovoAjuste] = useState<{ mes: number; de: string; para: string } | null>(null);
  const [detalhe, setDetalhe] = useState<{ mes: number; conta: string; nome: string } | null>(null);
  const [erro, setErro] = useState('');
  const [pendente, iniciar] = useTransition();

  const executar = (f: () => Promise<{ erro?: string }>) =>
    iniciar(async () => {
      setErro('');
      const r = await f();
      if (r.erro) setErro(r.erro);
    });

  const calc = useMemo(
    () => calcular({ contas, ajustes, depara, mensal, parametros, ultimoMesFechado }),
    [contas, ajustes, depara, mensal, parametros, ultimoMesFechado]
  );

  const { porRub, total, fat, receb, fechados, nMeses, somaMeses, mediaReceb, semRubrica, param, colunas, pctFat, mesesFat } = calc;
  const pctOu = (x: number | null) => (x === null ? '–' : pct(x));

  const despAno = soma(total);
  const fatAno = soma(fat);
  const recebAno = soma(receb);

  const celulaPct = (v: number, base: number) => (base > 0 && Math.abs(v) > 0.5 ? <span className="block text-[10px] font-normal text-on-surface-variant">{pct(v / base)}</span> : null);

  return (
    <div className="space-y-5">
      {/* ano e ações */}
      <div className="flex flex-wrap items-center gap-2">
        {Array.from({ length: anoAtual - 2024 }, (_, k) => 2025 + k).map((a) => (
          <Link
            key={a}
            href={`?ano=${a}`}
            className={`rounded-xl px-4 py-2 text-body font-bold ${a === ano ? 'bg-primary text-white' : 'border border-primary text-primary'}`}
          >
            {a}
          </Link>
        ))}
        <span className="flex-1" />
        <a
          href={`/api/relatorio-gerencial/excel?ano=${ano}`}
          className="rounded-xl border border-emerald-600 bg-emerald-50 px-4 py-2 text-body font-bold text-emerald-700 transition-all hover:-translate-y-0.5 hover:shadow-md"
        >
          Baixar Excel
        </a>
        <button type="button" className="rounded-xl border border-primary px-4 py-2 text-body font-bold text-primary" onClick={() => setEditarMes(Math.max(ultimoMesFechado, 1))}>
          Lançar faturamento / recebimento
        </button>
        <button type="button" className="rounded-xl bg-primary px-4 py-2 text-body font-bold text-white" onClick={() => setNovoAjuste({ mes: Math.max(ultimoMesFechado, 1), de: '', para: '' })}>
          Novo ajuste
        </button>
      </div>
      {erro && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-body-sm text-red-800">{erro}</p>}

      {/* números do ano */}
      <div className="kpi-grid grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ['Despesas pagas no ano', brl(despAno)],
          ['Faturamento no ano', brl(fatAno)],
          ['Despesas ÷ faturamento', pctOu(pctFat(total))],
          ['Recebimento no ano', brl(recebAno)],
          ['Contas sem rubrica', semRubrica.length ? `${semRubrica.length} · ${brl(soma(semRubrica.map((c) => soma(c.v))))}` : 'nenhuma'],
        ].map(([t, v]) => (
          <Card key={t} className="p-4">
            <p className="text-label font-semibold text-on-surface-variant">{t}</p>
            <p className="mt-1 text-h2 font-extrabold text-on-surface">{v}</p>
          </Card>
        ))}
      </div>

      {semRubrica.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/80 p-4">
          <p className="text-body font-bold text-amber-900">
            Contas pagas que ainda não têm rubrica. Elas entram no total de despesas, mas não em nenhuma linha: escolha a rubrica de cada uma.
          </p>
          <p className="mt-1 text-body-sm text-amber-900">Clique na setinha para ver todos os pagamentos da conta no ano e decidir onde ela entra.</p>
          <div className="mt-3 space-y-1">
            {semRubrica.map((c) => (
              <div key={c.conta}>
                <div className="flex flex-wrap items-center gap-3 text-body-sm">
                  <button
                    type="button"
                    onClick={() => setSemAberta(semAberta === c.conta ? null : c.conta)}
                    className="flex w-[22rem] items-center gap-1 truncate rounded-lg px-1 text-left font-semibold hover:bg-amber-100"
                    title={`${c.grupo} › ${c.nome} (${c.conta}) — clique para ver os pagamentos`}
                    aria-expanded={semAberta === c.conta}
                  >
                    <span className="inline-block w-4 shrink-0 text-primary">{semAberta === c.conta ? '▾' : '▸'}</span>
                    <span className="truncate">
                      {c.nome} <span className="font-normal text-on-surface-variant">({c.conta})</span>
                    </span>
                  </button>
                  <span className="w-32 text-right font-bold">{brl(soma(c.v))}</span>
                  <SeletorRubrica valor="" onTrocar={(r) => executar(() => definirRubrica(c.conta, r))} desabilitado={pendente} />
                </div>
                {semAberta === c.conta && (
                  <div className="my-2 ml-6 rounded-xl border border-amber-200 bg-white p-3">
                    <ListaPagamentos ano={ano} mes={0} conta={c.conta} alturaMax="420px" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* tabela principal */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-body-sm">
            <thead>
              <tr className="bg-primary text-white">
                <th className="sticky left-0 z-10 min-w-[260px] bg-primary px-3 py-2 text-left">Rubrica</th>
                {colunas.map((i) => (
                  <th key={i} className={`px-2 py-2 text-right ${i >= ultimoMesFechado ? 'opacity-70' : ''}`}>
                    {MESES[i]}/{String(ano).slice(2)}
                  </th>
                ))}
                <th className="px-2 py-2 text-right">Total</th>
                <th className="px-2 py-2 text-right" title={`Média dos ${nMeses} meses fechados`}>
                  Média
                </th>
                <th className="px-2 py-2 text-right">Projeção ano</th>
                <th className="px-2 py-2 text-right">% s/ fat.</th>
                <th className="px-2 py-2 text-right">Parâm.</th>
                <th className="px-2 py-2 text-right" title="Parâmetro × média de recebimento">
                  Custo param.
                </th>
                <th className="px-2 py-2 text-right" title="Custo parametrizado − média: positivo = dentro do parâmetro">
                  Dentro / fora
                </th>
              </tr>
            </thead>
            <tbody>
              {CAMPOS.map((c, k) => {
                const v = calc.linhaMensal(c.id);
                const sub = k >= 1 && k <= 4;
                return (
                  <tr key={c.id} className={`border-b border-border-muted ${k === 0 ? 'bg-blue-50 font-bold' : ''} ${sub ? 'text-on-surface-variant' : ''}`}>
                    <td className={`sticky left-0 z-10 px-3 py-1.5 ${k === 0 ? 'bg-blue-50' : 'bg-white'} ${sub ? 'pl-7' : 'font-semibold'}`}>{c.rotulo}</td>
                    {colunas.map((i) => (
                      <td key={i} className="cursor-pointer px-2 py-1.5 text-right hover:bg-blue-100" title="Clique para lançar" onClick={() => setEditarMes(i + 1)}>
                        {n0(v[i])}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right font-bold">{n0(soma(v))}</td>
                    <td className="px-2 py-1.5 text-right">{n0(calc.mediaLancada(v))}</td>
                    <td colSpan={5} />
                  </tr>
                );
              })}

              <tr>
                <td colSpan={colunas.length + 8} className="bg-slate-100 px-3 py-1.5 text-label font-extrabold uppercase tracking-wide text-on-surface-variant">
                  Despesas pagas no mês
                </td>
              </tr>

              {RUBRICAS.map((r) => {
                const v = porRub.get(r.cod) ?? zeros();
                const aj = calc.ajPorRub.get(r.cod);
                const contasR = Array.from(calc.contasPorRub.get(r.cod)?.values() ?? []).sort((a, b) => soma(b.v) - soma(a.v));
                const media = somaMeses(v) / nMeses;
                const p = param(r.cod);
                const custo = p * mediaReceb;
                const vazia = !contasR.length && !aj && Math.abs(soma(v)) < 0.5;
                const abrir = aberta === r.cod;
                return (
                  <Fragment key={r.cod}>
                    <tr
                      className={`cursor-pointer border-b border-border-muted transition-colors hover:bg-blue-50 ${vazia ? 'text-on-surface-variant/60' : ''} ${abrir ? 'bg-blue-50' : ''}`}
                      onClick={() => setAberta(abrir ? null : r.cod)}
                    >
                      <td className={`sticky left-0 z-10 px-3 py-1.5 font-semibold ${abrir ? 'bg-blue-50' : 'bg-white'}`}>
                        <span className="mr-1 inline-block w-3 text-primary">{abrir ? '▾' : '▸'}</span>
                        <span className="text-on-surface-variant">{r.cod}</span> {r.nome}
                      </td>
                      {colunas.map((i) => (
                        <td key={i} className="px-2 py-1.5 text-right font-semibold">
                          {n0(v[i])}
                          {aj && Math.abs(aj[i]) > 0.5 && <span className="ml-0.5 text-[10px] text-amber-600" title={`Inclui ajuste de ${brl(aj[i])}`}>●</span>}
                          {celulaPct(v[i], fat[i])}
                        </td>
                      ))}
                      <td className="px-2 py-1.5 text-right font-bold">{n0(soma(v))}</td>
                      <td className="px-2 py-1.5 text-right">{n0(media)}</td>
                      <td className="px-2 py-1.5 text-right">{n0(media * 12)}</td>
                      <td className="px-2 py-1.5 text-right">{pctOu(pctFat(v))}</td>
                      <td className="px-2 py-1.5 text-right">{p ? pct(p) : '–'}</td>
                      <td className="px-2 py-1.5 text-right">{n0(custo)}</td>
                      <td className={`px-2 py-1.5 text-right font-bold ${!p ? '' : custo - media >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{p ? n0(custo - media) : '–'}</td>
                    </tr>
                    {abrir && (
                      <>
                        {contasR.map((c) => (
                          <tr key={c.conta} className="border-b border-border-muted bg-blue-50/40 text-on-surface-variant">
                            <td className="sticky left-0 z-10 bg-[#f3f7ff] py-1 pl-8 pr-3">
                              <span className="block truncate text-on-surface" title={`${c.grupo} › ${c.nome} (${c.conta})`}>
                                {c.nome}
                              </span>
                              <span className="flex items-center gap-2 text-[11px]">
                                {c.conta}
                                {c.trocada && <span className="rounded bg-amber-100 px-1 text-amber-800">rubrica trocada</span>}
                                <SeletorRubrica
                                  pequeno
                                  valor={r.cod}
                                  onTrocar={(nova) => executar(() => definirRubrica(c.conta, nova === c.padrao ? '' : nova))}
                                  desabilitado={pendente}
                                />
                              </span>
                            </td>
                            {colunas.map((i) => (
                              <td
                                key={i}
                                className={`px-2 py-1 text-right ${Math.abs(c.v[i]) > 0.5 ? 'cursor-pointer underline decoration-dotted hover:text-primary' : ''}`}
                                title={Math.abs(c.v[i]) > 0.5 ? 'Ver os pagamentos' : undefined}
                                onClick={() => Math.abs(c.v[i]) > 0.5 && setDetalhe({ mes: i + 1, conta: c.conta, nome: c.nome })}
                              >
                                {n0(c.v[i])}
                              </td>
                            ))}
                            <td className="px-2 py-1 text-right">{n0(soma(c.v))}</td>
                            <td colSpan={6} />
                          </tr>
                        ))}
                        {ajustes
                          .filter((a) => a.de_rubrica === r.cod || a.para_rubrica === r.cod)
                          .map((a) => (
                            <tr key={a.id} className="border-b border-border-muted bg-amber-50/60 text-amber-900">
                              <td className="sticky left-0 z-10 bg-amber-50 py-1 pl-8 pr-3 text-[12px]">
                                Ajuste: {a.descricao}
                                <span className="block text-[11px] opacity-80">
                                  {a.de_rubrica ? `sai de ${a.de_rubrica}` : ''}
                                  {a.de_rubrica && a.para_rubrica ? ' → ' : ''}
                                  {a.para_rubrica ? `entra em ${a.para_rubrica}` : ''} · {a.criado_por ?? ''}
                                </span>
                              </td>
                              {colunas.map((i) => (
                                <td key={i} className="px-2 py-1 text-right">
                                  {i === a.mes - 1 ? n0(a.de_rubrica === r.cod ? -a.valor : a.valor) : ''}
                                </td>
                              ))}
                              <td colSpan={7} />
                            </tr>
                          ))}
                        <tr className="border-b border-border-muted bg-blue-50/40">
                          <td colSpan={colunas.length + 8} className="py-2 pl-8 pr-3">
                            <div className="flex flex-wrap items-center gap-3 text-body-sm">
                              <ParametroEditor
                                valor={p}
                                trocado={r.cod in parametros}
                                desabilitado={pendente}
                                onSalvar={(x) => executar(() => salvarParametro(r.cod, x))}
                              />
                              <button
                                type="button"
                                className="rounded-lg border border-primary px-3 py-1 font-semibold text-primary"
                                onClick={() => setNovoAjuste({ mes: Math.max(ultimoMesFechado, 1), de: r.cod, para: '' })}
                              >
                                Ajuste tirando desta rubrica
                              </button>
                              <button
                                type="button"
                                className="rounded-lg border border-primary px-3 py-1 font-semibold text-primary"
                                onClick={() => setNovoAjuste({ mes: Math.max(ultimoMesFechado, 1), de: '', para: r.cod })}
                              >
                                Ajuste colocando nesta rubrica
                              </button>
                            </div>
                          </td>
                        </tr>
                      </>
                    )}
                  </Fragment>
                );
              })}

              {semRubrica.length > 0 && (
                <tr className="border-b border-border-muted bg-amber-50 text-amber-900">
                  <td className="sticky left-0 z-10 bg-amber-50 px-3 py-1.5 font-semibold">Sem rubrica (ver aviso acima)</td>
                  {colunas.map((i) => (
                    <td key={i} className="px-2 py-1.5 text-right">
                      {n0((porRub.get('') ?? zeros())[i])}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right font-bold">{n0(soma(porRub.get('') ?? zeros()))}</td>
                  <td colSpan={6} />
                </tr>
              )}

              <tr className="bg-slate-800 font-extrabold text-white">
                <td className="sticky left-0 z-10 bg-slate-800 px-3 py-2">TOTAL GERAL DESPESAS</td>
                {colunas.map((i) => (
                  <td key={i} className="px-2 py-2 text-right">
                    {n0(total[i])}
                  </td>
                ))}
                <td className="px-2 py-2 text-right">{n0(despAno)}</td>
                <td className="px-2 py-2 text-right">{n0(somaMeses(total) / nMeses)}</td>
                <td className="px-2 py-2 text-right">{n0((somaMeses(total) / nMeses) * 12)}</td>
                <td className="px-2 py-2 text-right">{pctOu(pctFat(total))}</td>
                <td className="px-2 py-2 text-right">{pct(RUBRICAS.reduce((s, r) => s + param(r.cod), 0))}</td>
                <td className="px-2 py-2 text-right">{n0(RUBRICAS.reduce((s, r) => s + param(r.cod), 0) * mediaReceb)}</td>
                <td />
              </tr>
              <tr className="border-b border-border-muted font-bold">
                <td className="sticky left-0 z-10 bg-white px-3 py-1.5">Despesas ÷ faturamento</td>
                {colunas.map((i) => (
                  <td key={i} className={`px-2 py-1.5 text-right ${fat[i] && total[i] / fat[i] > 1 ? 'text-red-600' : ''}`}>
                    {fat[i] ? pct(total[i] / fat[i]) : '–'}
                  </td>
                ))}
                <td colSpan={8} />
              </tr>
              <tr className="border-b border-border-muted font-bold">
                <td className="sticky left-0 z-10 bg-white px-3 py-1.5">Recebimento − despesas</td>
                {colunas.map((i) => (
                  <td key={i} className={`px-2 py-1.5 text-right ${receb[i] - total[i] < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                    {receb[i] ? n0(receb[i] - total[i]) : '–'}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right">{n0(recebAno - despAno)}</td>
                <td colSpan={7} />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-label text-on-surface-variant">
          Despesa = valor pago no mês (data do pagamento), como no relatório do ORGM &quot;pagamentos por conta contábil&quot;. Média e projeção usam os {fechados.length} meses fechados; % s/ faturamento só os meses com faturamento lançado
          ({mesesFat.map((i) => MESES[i]).join(', ') || 'nenhum'}). Clique numa rubrica para ver as contas, trocar a rubrica de uma conta, mudar o parâmetro ou lançar ajuste; clique num
          valor da conta para ver os pagamentos.
        </p>
      </Card>

      {/* ajustes do ano */}
      <Card className="p-4">
        <p className="text-h2 font-extrabold text-on-surface">Ajustes lançados em {ano}</p>
        {ajustes.length === 0 ? (
          <p className="mt-2 text-body-sm text-on-surface-variant">Nenhum ajuste. Use &quot;Novo ajuste&quot; para tirar valor de uma rubrica e colocar em outra.</p>
        ) : (
          <table className="mt-3 w-full text-body-sm">
            <thead>
              <tr className="border-b border-border-muted text-left text-on-surface-variant">
                <th className="py-1">Mês</th>
                <th>Sai de</th>
                <th>Entra em</th>
                <th className="text-right">Valor</th>
                <th className="pl-4">Motivo</th>
                <th>Por</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ajustes.map((a) => (
                <tr key={a.id} className="border-b border-border-muted">
                  <td className="py-1 font-semibold">{MESES[a.mes - 1]}</td>
                  <td>{a.de_rubrica ? `${a.de_rubrica} ${NOME_RUBRICA.get(a.de_rubrica) ?? ''}` : '–'}</td>
                  <td>{a.para_rubrica ? `${a.para_rubrica} ${NOME_RUBRICA.get(a.para_rubrica) ?? ''}` : '–'}</td>
                  <td className="text-right font-bold">{brl(a.valor)}</td>
                  <td className="pl-4">{a.descricao}</td>
                  <td>{a.criado_por}</td>
                  <td className="text-right">
                    <button
                      type="button"
                      disabled={pendente}
                      className="rounded-lg px-2 py-0.5 font-semibold text-red-600 hover:bg-red-50"
                      onClick={() => confirm('Excluir este ajuste?') && executar(() => excluirAjuste(a.id))}
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {editarMes !== null && (
        <JanelaMensal
          ano={ano}
          mesInicial={editarMes}
          mensal={mensal}
          fechar={() => setEditarMes(null)}
          salvar={(mes, valores) =>
            iniciar(async () => {
              setErro('');
              const r = await salvarMensal(ano, mes, valores);
              if (r.erro) setErro(r.erro);
              else setEditarMes(null);
            })
          }
          pendente={pendente}
        />
      )}
      {novoAjuste && (
        <JanelaAjuste
          inicial={novoAjuste}
          fechar={() => setNovoAjuste(null)}
          pendente={pendente}
          salvar={(d) =>
            iniciar(async () => {
              setErro('');
              const r = await criarAjuste({ ano, ...d });
              if (r.erro) setErro(r.erro);
              else setNovoAjuste(null);
            })
          }
        />
      )}
      {detalhe && <JanelaDetalhe ano={ano} {...detalhe} fechar={() => setDetalhe(null)} />}
    </div>
  );
}

function SeletorRubrica({ valor, onTrocar, desabilitado, pequeno }: { valor: string; onTrocar: (r: string) => void; desabilitado?: boolean; pequeno?: boolean }) {
  return (
    <select
      value={valor}
      disabled={desabilitado}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onTrocar(e.target.value)}
      className={`rounded-lg border border-border-muted bg-white ${pequeno ? 'max-w-[170px] px-1 py-0 text-[11px]' : 'px-2 py-1 text-body-sm'}`}
    >
      {!valor && <option value="">Escolher rubrica…</option>}
      {RUBRICAS.map((r) => (
        <option key={r.cod} value={r.cod}>
          {r.cod} {r.nome}
        </option>
      ))}
    </select>
  );
}

function ParametroEditor({ valor, trocado, desabilitado, onSalvar }: { valor: number; trocado: boolean; desabilitado: boolean; onSalvar: (v: number | null) => void }) {
  const [texto, setTexto] = useState(String(Math.round(valor * 10000) / 100).replace('.', ','));
  return (
    <span className="flex items-center gap-2">
      <span className="font-semibold">Parâmetro s/ faturamento:</span>
      <input value={texto} onChange={(e) => setTexto(e.target.value)} className="w-20 rounded-lg border border-border-muted px-2 py-1 text-right" />
      %
      <button
        type="button"
        disabled={desabilitado}
        className="rounded-lg bg-primary px-3 py-1 font-semibold text-white"
        onClick={() => onSalvar(Number(texto.replace(/\./g, '').replace(',', '.')) / 100)}
      >
        Salvar
      </button>
      {trocado && (
        <button type="button" disabled={desabilitado} className="text-[12px] underline" onClick={() => onSalvar(null)}>
          voltar ao padrão
        </button>
      )}
    </span>
  );
}

function Janela({ titulo, fechar, children, largo }: { titulo: string; fechar: () => void; children: React.ReactNode; largo?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4" onClick={fechar}>
      <div className={`mt-10 w-full ${largo ? 'max-w-5xl' : 'max-w-lg'} rounded-2xl bg-white p-5 shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-h2 font-extrabold text-on-surface">{titulo}</p>
          <button type="button" onClick={fechar} className="rounded-lg px-2 text-h2 text-on-surface-variant hover:bg-slate-100" aria-label="Fechar">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const lerNumero = (t: string) => Number(t.replace(/\s|R\$/g, '').replace(/\./g, '').replace(',', '.')) || 0;
const mostrarNumero = (v: number) => (v ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');

function JanelaMensal({
  ano,
  mesInicial,
  mensal,
  fechar,
  salvar,
  pendente,
}: {
  ano: number;
  mesInicial: number;
  mensal: Mensal[];
  fechar: () => void;
  salvar: (mes: number, valores: Record<string, number>) => void;
  pendente: boolean;
}) {
  const [mes, setMes] = useState(mesInicial);
  const valoresDe = (m: number) => {
    const x = mensal.find((y) => y.mes === m);
    return Object.fromEntries(CAMPOS.map((c) => [c.id, mostrarNumero(x?.[c.id] ?? 0)]));
  };
  const [textos, setTextos] = useState<Record<string, string>>(valoresDe(mesInicial));
  const somaCat = ['fat_off', 'fat_terceiros', 'fat_ecommerce', 'fat_exportacao'].reduce((s, k) => s + lerNumero(textos[k] ?? ''), 0);
  return (
    <Janela titulo={`Faturamento e recebimento — ${ano}`} fechar={fechar}>
      <label className="mb-3 flex items-center gap-2 text-body font-semibold">
        Mês
        <select
          value={mes}
          onChange={(e) => {
            const m = Number(e.target.value);
            setMes(m);
            setTextos(valoresDe(m));
          }}
          className="rounded-lg border border-border-muted px-2 py-1"
        >
          {MESES.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}/{ano}
            </option>
          ))}
        </select>
      </label>
      <div className="space-y-2">
        {CAMPOS.map((c) => (
          <label key={c.id} className="flex items-center justify-between gap-3 text-body-sm">
            <span className={c.id.startsWith('fat_') ? 'pl-4 text-on-surface-variant' : 'font-semibold'}>{c.rotulo}</span>
            <input
              inputMode="decimal"
              value={textos[c.id] ?? ''}
              onChange={(e) => setTextos({ ...textos, [c.id]: e.target.value })}
              onBlur={(e) => setTextos({ ...textos, [c.id]: mostrarNumero(lerNumero(e.target.value)) })}
              className="w-44 rounded-lg border border-border-muted px-2 py-1 text-right"
              placeholder="0,00"
            />
          </label>
        ))}
      </div>
      <p className="mt-2 text-label text-on-surface-variant">Soma das 4 categorias: {brl(somaCat)}</p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={fechar} className="rounded-xl border border-border-muted px-4 py-2 font-semibold">
          Cancelar
        </button>
        <button
          type="button"
          disabled={pendente}
          onClick={() => salvar(mes, Object.fromEntries(CAMPOS.map((c) => [c.id, lerNumero(textos[c.id] ?? '')])))}
          className="rounded-xl bg-primary px-4 py-2 font-bold text-white"
        >
          {pendente ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </Janela>
  );
}

function JanelaAjuste({
  inicial,
  fechar,
  salvar,
  pendente,
}: {
  inicial: { mes: number; de: string; para: string };
  fechar: () => void;
  salvar: (d: { mes: number; de: string | null; para: string | null; valor: number; descricao: string }) => void;
  pendente: boolean;
}) {
  const [mes, setMes] = useState(inicial.mes);
  const [de, setDe] = useState(inicial.de);
  const [para, setPara] = useState(inicial.para);
  const [valor, setValor] = useState('');
  const [descricao, setDescricao] = useState('');
  const sel = (v: string, set: (x: string) => void, vazio: string) => (
    <select value={v} onChange={(e) => set(e.target.value)} className="w-full rounded-lg border border-border-muted px-2 py-1">
      <option value="">{vazio}</option>
      {RUBRICAS.map((r) => (
        <option key={r.cod} value={r.cod}>
          {r.cod} {r.nome}
        </option>
      ))}
    </select>
  );
  return (
    <Janela titulo="Novo ajuste" fechar={fechar}>
      <div className="space-y-3 text-body-sm">
        <label className="block font-semibold">
          Mês
          <select value={mes} onChange={(e) => setMes(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-border-muted px-2 py-1">
            {MESES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="block font-semibold">
          Sai da rubrica
          {sel(de, setDe, '(nenhuma: só acrescenta)')}
        </label>
        <label className="block font-semibold">
          Entra na rubrica
          {sel(para, setPara, '(nenhuma: só retira)')}
        </label>
        <label className="block font-semibold">
          Valor (R$)
          <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" className="mt-1 w-full rounded-lg border border-border-muted px-2 py-1 text-right" placeholder="0,00" />
        </label>
        <label className="block font-semibold">
          Motivo
          <input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border-muted px-2 py-1"
            placeholder="ex.: INSS de fevereiro lançado na conta IRRF"
          />
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={fechar} className="rounded-xl border border-border-muted px-4 py-2 font-semibold">
          Cancelar
        </button>
        <button
          type="button"
          disabled={pendente}
          onClick={() => salvar({ mes, de: de || null, para: para || null, valor: lerNumero(valor), descricao })}
          className="rounded-xl bg-primary px-4 py-2 font-bold text-white"
        >
          {pendente ? 'Salvando…' : 'Lançar ajuste'}
        </button>
      </div>
    </Janela>
  );
}

/** Pagamentos de uma conta (num mês, ou no ano todo com mes 0), buscados no ORGM. */
function ListaPagamentos({ ano, mes, conta, alturaMax = '65vh' }: { ano: number; mes: number; conta: string; alturaMax?: string }) {
  const [estado, setEstado] = useState<{ carregando: boolean; erro?: string; linhas?: Pagamento[] }>({ carregando: true });
  useEffect(() => {
    let vivo = true;
    detalheConta(ano, mes, conta).then(
      (r) => vivo && setEstado({ carregando: false, ...r }),
      (e) => vivo && setEstado({ carregando: false, erro: String(e) })
    );
    return () => {
      vivo = false;
    };
  }, [ano, mes, conta]);
  const linhas = estado.linhas ?? [];
  const temPedido = linhas.some((l) => l.pedido || l.item);
  if (estado.carregando) return <p className="py-2 text-body-sm text-on-surface-variant">Buscando no ORGM…</p>;
  if (estado.erro) return <p className="py-2 text-body-sm text-red-700">{estado.erro}</p>;
  const ordenadas = mes ? linhas : linhas.slice().sort((a, b) => a.data.localeCompare(b.data));
  return (
    <div className="overflow-y-auto" style={{ maxHeight: alturaMax }}>
      <table className="w-full text-body-sm">
        <thead className="sticky top-0 bg-white">
          <tr className="border-b border-border-muted text-left text-on-surface-variant">
            <th className="py-1">Pagto.</th>
            <th>Favorecido</th>
            <th>Histórico</th>
            {temPedido && <th>Pedido de compra / item</th>}
            <th>Empresa</th>
            <th className="text-right">Valor</th>
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((l) => (
            <tr key={`${l.finMovId}-${l.valor}`} className="border-b border-border-muted bg-white">
              <td className="whitespace-nowrap py-1 pr-2">{l.data.split('-').reverse().join('/')}</td>
              <td className="pr-2 font-semibold">{l.favorecido}</td>
              <td className="pr-2">{l.historico}</td>
              {temPedido && (
                <td className="pr-2">
                  {l.pedido ? <span className="font-semibold">{l.pedido}</span> : <span className="text-on-surface-variant">sem pedido</span>}
                  {l.item && <span className="block text-[11px] text-on-surface-variant">{l.item}</span>}
                </td>
              )}
              <td className="pr-2 text-on-surface-variant">{l.empresa}</td>
              <td className="whitespace-nowrap text-right font-bold">{brl(l.valor)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-extrabold">
            <td colSpan={temPedido ? 5 : 4} className="py-2">
              {linhas.length} pagamento(s)
            </td>
            <td className="text-right">{brl(soma(linhas.map((l) => l.valor)))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function JanelaDetalhe({ ano, mes, conta, nome, fechar }: { ano: number; mes: number; conta: string; nome: string; fechar: () => void }) {
  return (
    <Janela titulo={`${nome} — ${MESES[mes - 1]}/${ano}`} fechar={fechar} largo>
      <ListaPagamentos ano={ano} mes={mes} conta={conta} />
    </Janela>
  );
}
