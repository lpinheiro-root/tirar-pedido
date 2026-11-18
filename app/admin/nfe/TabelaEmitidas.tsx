'use client';

import { Fragment, useState } from 'react';
import { formatCurrency } from '@/lib/format';
import type { NotaEmitida, OrigemRemessa } from '@/lib/nfe/dados';

const th = 'px-3 py-2.5 font-medium';
const td = 'px-3 py-2 text-body-sm';
const br = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const SITUACAO = {
  autorizada: { rotulo: 'Autorizada', cor: 'bg-green-100 text-green-800' },
  cancelada: { rotulo: 'Cancelada', cor: 'bg-red-100 text-red-800' },
  pendente: { rotulo: 'Sem autorização', cor: 'bg-amber-100 text-amber-800' },
} as const;

type Origem = OrigemRemessa & { empresa: string | null; erro?: string };

function Baixar({ chave }: { chave: string }) {
  return (
    <span className="inline-flex gap-2 whitespace-nowrap">
      <a href={`/api/nfe/danfe?chave=${chave}`} target="_blank" className="font-medium text-primary hover:underline">
        DANFE
      </a>
      <a href={`/api/nfe/xml?chave=${chave}`} className="font-medium text-primary hover:underline">
        XML
      </a>
    </span>
  );
}

function Situacao({ s }: { s: NotaEmitida['situacao'] }) {
  return <span className={`whitespace-nowrap rounded-sm px-2 py-0.5 text-label font-medium ${SITUACAO[s].cor}`}>{SITUACAO[s].rotulo}</span>;
}

/** Linha que abre embaixo da remessa por conta e ordem com a nota de origem. */
function LinhaOrigem({ origem }: { origem: Origem | 'carregando' }) {
  const fundo = 'border-t border-dashed border-border-muted bg-surface-container-low';
  if (origem === 'carregando') {
    return (
      <tr className={fundo}>
        <td colSpan={9} className="px-3 py-3 pl-10 text-body-sm text-on-surface-variant">
          Buscando a nota de origem…
        </td>
      </tr>
    );
  }
  if (origem.erro || !origem.nota) {
    const r = origem.referencia;
    return (
      <tr className={fundo}>
        <td colSpan={9} className="px-3 py-3 pl-10 text-body-sm text-on-surface-variant">
          {origem.erro ??
            (r
              ? `A remessa cita a NF ${r.numero} (série ${r.serie}) de ${br(r.data)}, emitida por ${r.emitente}, mas essa nota não foi encontrada no ERP.`
              : 'A remessa não cita a nota de origem no texto da nota.')}
        </td>
      </tr>
    );
  }
  const n = origem.nota;
  return (
    <tr className={`${fundo} align-top`}>
      <td />
      <td className={`${td} whitespace-nowrap pl-10`}>
        <span className="text-label uppercase text-primary">↳ Origem</span>
        <div>{br(n.emissao)}</div>
      </td>
      <td className={`${td} whitespace-nowrap font-medium`}>
        {n.numero}
        {n.serie && <span className="text-on-surface-variant"> / {n.serie}</span>}
      </td>
      <td className={`${td} text-on-surface-variant`}>{origem.empresa}</td>
      <td className={td}>
        {n.destinatario}
        <div className="text-label text-on-surface-variant">
          {n.documento} {n.uf && `· ${n.uf}`}
        </div>
      </td>
      <td className={`${td} text-on-surface-variant`}>{n.natureza}</td>
      <td className={`${td} whitespace-nowrap text-right font-medium`}>{formatCurrency(n.valor)}</td>
      <td className={td}>
        <Situacao s={n.situacao} />
      </td>
      <td className={td}>{n.chave && n.situacao !== 'pendente' && <Baixar chave={n.chave} />}</td>
    </tr>
  );
}

/** Notas emitidas; remessa por conta e ordem ganha uma seta que abre a nota de origem embaixo. */
export function TabelaEmitidas({ notas, empresas }: { notas: NotaEmitida[]; empresas: Record<string, string> }) {
  const [abertas, setAbertas] = useState<Record<number, Origem | 'carregando'>>({});
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [formato, setFormato] = useState<'ambos' | 'danfe' | 'xml'>('ambos');
  const [baixando, setBaixando] = useState(false);
  const [erroLote, setErroLote] = useState<string | null>(null);

  async function alternar(id: number) {
    if (abertas[id]) {
      setAbertas(({ [id]: _, ...resto }) => resto);
      return;
    }
    setAbertas((a) => ({ ...a, [id]: 'carregando' }));
    try {
      const r = await fetch(`/api/nfe/origem?id=${id}`);
      const dados = (await r.json()) as Origem;
      setAbertas((a) => ({ ...a, [id]: r.ok ? dados : { referencia: null, nota: null, empresa: null, erro: dados.erro ?? 'Falhou.' } }));
    } catch {
      setAbertas((a) => ({ ...a, [id]: { referencia: null, nota: null, empresa: null, erro: 'Não consegui buscar a nota de origem.' } }));
    }
  }

  // só nota com chave e autorizada/cancelada tem XML para baixar
  const baixaveis = notas.filter((n) => n.chave && n.situacao !== 'pendente').map((n) => n.chave);
  const todasMarcadas = baixaveis.length > 0 && baixaveis.every((c) => marcadas.has(c));

  function marcar(chave: string) {
    setMarcadas((m) => {
      const nova = new Set(m);
      if (nova.has(chave)) nova.delete(chave);
      else nova.add(chave);
      return nova;
    });
  }

  async function baixarMarcadas() {
    setBaixando(true);
    setErroLote(null);
    try {
      const r = await fetch('/api/nfe/lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chaves: Array.from(marcadas), formato }),
      });
      if (!r.ok) throw new Error((await r.text()) || 'Não consegui gerar o arquivo.');
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = r.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'notas.zip';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setErroLote(e instanceof Error ? e.message : 'Não consegui gerar o arquivo.');
    } finally {
      setBaixando(false);
    }
  }

  return (
    <>
    {baixaveis.length > 0 && (
      <div className="flex flex-wrap items-center gap-3 border-b border-border-muted px-3 py-2.5 text-body-sm">
        <label className="inline-flex cursor-pointer items-center gap-2 font-medium text-on-surface">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={todasMarcadas}
            onChange={() => setMarcadas(todasMarcadas ? new Set() : new Set(baixaveis))}
          />
          Marcar todas ({baixaveis.length})
        </label>
        <span className="text-on-surface-variant">{marcadas.size} marcada(s)</span>
        <select
          value={formato}
          onChange={(e) => setFormato(e.target.value as typeof formato)}
          className="h-8 rounded-md border border-[#D1D5DB] bg-surface-container-lowest px-2 text-body-sm text-on-surface"
        >
          <option value="ambos">DANFE (PDF) + XML</option>
          <option value="danfe">Só DANFE (PDF)</option>
          <option value="xml">Só XML</option>
        </select>
        <button
          type="button"
          onClick={baixarMarcadas}
          disabled={!marcadas.size || baixando}
          className="inline-flex h-8 items-center rounded-md bg-primary px-3 font-medium text-on-primary hover:bg-primary/90 disabled:opacity-50"
        >
          {baixando ? 'Gerando o ZIP…' : `Baixar marcadas${marcadas.size ? ` (${marcadas.size})` : ''}`}
        </button>
        {marcadas.size > 0 && !baixando && (
          <button type="button" onClick={() => setMarcadas(new Set())} className="text-on-surface-variant hover:text-on-surface">
            Desmarcar
          </button>
        )}
        {erroLote && <span className="text-error">{erroLote}</span>}
      </div>
    )}
    <table className="w-full text-left">
      <thead className="bg-surface-container-low text-label uppercase text-on-surface-variant">
        <tr>
          <th className="w-8 py-2.5 pl-3"></th>
          <th className={th}>Emissão</th>
          <th className={th}>Nº / série</th>
          <th className={th}>Empresa</th>
          <th className={th}>Destinatário</th>
          <th className={th}>Natureza</th>
          <th className={`${th} text-right`}>Valor</th>
          <th className={th}>Situação</th>
          <th className={th}></th>
        </tr>
      </thead>
      <tbody>
        {notas.map((n) => (
          <Fragment key={n.id}>
            <tr className={`border-t border-border-muted align-top ${marcadas.has(n.chave) ? 'bg-primary/5' : ''}`}>
              <td className="py-2 pl-3">
                {n.chave && n.situacao !== 'pendente' && (
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
                    checked={marcadas.has(n.chave)}
                    onChange={() => marcar(n.chave)}
                    aria-label={`Marcar a nota ${n.numero}`}
                  />
                )}
              </td>
              <td className={`${td} whitespace-nowrap`}>{br(n.emissao)}</td>
              <td className={`${td} whitespace-nowrap font-medium`}>
                {n.contaOrdem && (
                  <button
                    type="button"
                    onClick={() => alternar(n.id)}
                    title={abertas[n.id] ? 'Fechar a nota de origem' : 'Ver a nota de origem'}
                    aria-expanded={Boolean(abertas[n.id])}
                    className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 align-middle text-primary transition hover:bg-primary/20"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="18"
                      height="18"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`transition-transform ${abertas[n.id] ? 'rotate-90' : ''}`}
                      aria-hidden="true"
                    >
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </button>
                )}
                {n.numero}
                {n.serie && <span className="text-on-surface-variant"> / {n.serie}</span>}
                {n.tipo === 'entrada' && <span className="ml-1 rounded-sm bg-sky-100 px-1.5 text-label text-sky-800">entrada</span>}
              </td>
              <td className={`${td} text-on-surface-variant`}>{empresas[n.empresaId] ?? n.empresaId}</td>
              <td className={td}>
                {n.destinatario}
                <div className="text-label text-on-surface-variant">
                  {n.documento} {n.uf && `· ${n.uf}`}
                </div>
              </td>
              <td className={`${td} text-on-surface-variant`}>{n.natureza}</td>
              <td className={`${td} whitespace-nowrap text-right font-medium`}>{formatCurrency(n.valor)}</td>
              <td className={td}>
                <Situacao s={n.situacao} />
              </td>
              <td className={td}>{n.chave && n.situacao !== 'pendente' && <Baixar chave={n.chave} />}</td>
            </tr>
            {abertas[n.id] && <LinhaOrigem origem={abertas[n.id]} />}
          </Fragment>
        ))}
        {notas.length === 0 && (
          <tr>
            <td colSpan={9} className="px-4 py-8 text-center text-body-sm text-on-surface-variant">
              Nenhuma nota emitida encontrada com essa busca.
            </td>
          </tr>
        )}
      </tbody>
    </table>
    </>
  );
}
