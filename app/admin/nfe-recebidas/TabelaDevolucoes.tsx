'use client';

import { Fragment, useState } from 'react';
import { CelulaEditavel } from './CelulaEditavel';
import { IconDownload } from '@/components/ui/Icons';
import type { CampoAcompanhamento } from '@/lib/devolucoes';

export interface LinhaDevolucao {
  id: string;
  chave: string;
  empresa: string;
  emissao: string;
  cliente: string;
  clienteDoc: string;
  clienteUf: string;
  origens: string[];
  nfd: string;
  valor: string;
  cancelada: boolean;
  transportadoraNota: string | null;
  respostas: Partial<Record<CampoAcompanhamento, string | null>>;
}

export interface CampoInfo {
  campo: CampoAcompanhamento;
  titulo: string;
  opcoes: string[];
}

// na linha principal; os demais ficam no detalhe (▸)
const PRINCIPAIS: CampoAcompanhamento[] = ['motivo', 'status', 'nf_fiscal'];

export function TabelaDevolucoes({ linhas, campos }: { linhas: LinhaDevolucao[]; campos: CampoInfo[] }) {
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const alternar = (id: string) =>
    setAbertas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const info = (c: CampoAcompanhamento) => campos.find((x) => x.campo === c)!;
  const detalhe = campos.filter((c) => !PRINCIPAIS.includes(c.campo));

  return (
    <table className="w-full table-fixed text-left">
      <colgroup>
        <col className="w-9" />
        <col className="w-[110px]" />
        <col className="w-[92px]" />
        <col />
        <col className="w-[120px]" />
        <col className="w-[110px]" />
        <col className="w-[15%]" />
        <col className="w-[18%]" />
        <col className="w-[18%]" />
        <col className="w-[96px]" />
      </colgroup>
      <thead className="bg-surface-container-low">
        <tr className="text-label uppercase text-on-surface-variant">
          <th className="py-3" />
          <th className="px-2 py-3 font-medium">Empresa</th>
          <th className="px-2 py-3 font-medium">Emissão</th>
          <th className="px-2 py-3 font-medium">Cliente</th>
          <th className="px-2 py-3 font-medium">NFD / Origem</th>
          <th className="px-2 py-3 text-right font-medium">Valor</th>
          <th className="px-2 py-3 font-medium">Motivo</th>
          <th className="px-2 py-3 font-medium">Status</th>
          <th className="px-2 py-3 font-medium">NF fiscal</th>
          <th className="px-2 py-3 font-medium">Baixar</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((l) => {
          const aberta = abertas.has(l.id);
          const preenchidos = campos.filter((c) => l.respostas[c.campo]).length;
          return (
            <Fragment key={l.id}>
              <tr className={`border-t border-border-muted align-top ${aberta ? 'bg-surface-container-low/40' : ''}`}>
                <td className="py-2 pl-2">
                  <button
                    type="button"
                    onClick={() => alternar(l.id)}
                    title={aberta ? 'Fechar detalhes' : 'Ver todos os campos'}
                    className="flex h-7 w-7 items-center justify-center rounded text-on-surface-variant hover:bg-primary-fixed hover:text-primary"
                  >
                    <span className={`inline-block transition-transform ${aberta ? 'rotate-90' : ''}`}>▸</span>
                  </button>
                </td>
                <td className="px-2 py-2">
                  <p className="truncate text-body-sm font-medium text-on-surface" title={l.empresa}>
                    {l.empresa}
                  </p>
                  <p className="text-label text-on-surface-variant">{preenchidos}/{campos.length} preench.</p>
                </td>
                <td className="px-2 py-2 text-body-sm text-on-surface-variant">{l.emissao}</td>
                <td className="px-2 py-2">
                  <p className="truncate text-body-sm text-on-surface" title={l.cliente}>
                    {l.cliente}
                  </p>
                  <p className="truncate text-label text-on-surface-variant">
                    {l.clienteDoc}
                    {l.clienteUf ? ` · ${l.clienteUf}` : ''}
                  </p>
                </td>
                <td className="px-2 py-2">
                  <p className="text-body-sm font-medium text-on-surface">{l.nfd}</p>
                  <p className="truncate text-label text-on-surface-variant" title={l.origens.join(', ')}>
                    {l.origens.length ? `orig. ${l.origens.join(', ')}` : 'sem origem'}
                  </p>
                </td>
                <td className="px-2 py-2 text-right text-body-sm font-medium text-on-surface">
                  {l.valor}
                  {l.cancelada && <p className="text-label font-medium text-error">Cancelada</p>}
                </td>
                {PRINCIPAIS.map((c) => (
                  <td key={c} className="px-1 py-1.5">
                    <CelulaEditavel
                      chave={l.chave}
                      campo={c}
                      titulo={info(c).titulo}
                      opcoes={info(c).opcoes}
                      valor={l.respostas[c] ?? null}
                      destaque={c !== 'motivo'}
                      abrirParaEsquerda={c === 'nf_fiscal'}
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <div className="flex flex-col gap-1">
                    <a href={`/api/cartao/notas/${l.id}/pdf`} className="inline-flex items-center gap-1 text-label font-medium text-primary hover:underline">
                      <IconDownload width={13} height={13} /> PDF
                    </a>
                    <a href={`/api/cartao/notas/${l.id}/xml`} className="text-label font-medium text-primary hover:underline">
                      XML
                    </a>
                  </div>
                </td>
              </tr>
              {aberta && (
                <tr className="bg-surface-container-low/40">
                  <td />
                  <td colSpan={9} className="px-2 pb-4 pt-1">
                    <div className="grid grid-cols-1 gap-x-4 gap-y-3 rounded-md border border-border-muted bg-surface-container-lowest p-3 sm:grid-cols-2 xl:grid-cols-3">
                      {detalhe.map((c) => (
                        <div key={c.campo}>
                          <p className="mb-0.5 px-1.5 text-label font-medium text-on-surface-variant">{c.titulo}</p>
                          <CelulaEditavel
                            chave={l.chave}
                            campo={c.campo}
                            titulo={c.titulo}
                            opcoes={c.opcoes}
                            valor={l.respostas[c.campo] ?? null}
                            sugestao={c.campo === 'transportadora' ? l.transportadoraNota : null}
                          />
                        </div>
                      ))}
                      <div>
                        <p className="mb-0.5 px-1.5 text-label font-medium text-on-surface-variant">Estado do cliente</p>
                        <p className="px-1.5 py-1 text-label text-on-surface">{l.clienteUf || '—'}</p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="mb-0.5 px-1.5 text-label font-medium text-on-surface-variant">Notas de origem</p>
                        <p className="break-words px-1.5 py-1 text-label text-on-surface">{l.origens.join(', ') || '—'}</p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
        {linhas.length === 0 && (
          <tr>
            <td colSpan={10} className="px-4 py-8 text-center text-body-sm text-on-surface-variant">
              Nenhuma devolução encontrada com esses filtros.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
