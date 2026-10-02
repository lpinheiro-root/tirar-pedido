'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { salvarCampoDevolucao } from './actions';
import { preencherModelo } from '@/lib/devolucoes';

const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Célula do acompanhamento: clicar abre a lista de respostas usadas pela
 * equipe; respostas com [data]/[nº] pedem o complemento; "Outro" deixa digitar.
 */
export function CelulaEditavel({
  chave,
  campo,
  titulo,
  valor,
  sugestao,
  opcoes,
  destaque = false,
  abrirParaEsquerda = false,
}: {
  chave: string;
  campo: string;
  titulo: string;
  valor: string | null;
  /** valor vindo da própria nota (ex.: transportadora), mostrado até alguém confirmar */
  sugestao?: string | null;
  opcoes: string[];
  destaque?: boolean;
  /** abre a lista alinhada à direita (colunas no fim da tabela) */
  abrirParaEsquerda?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [atual, setAtual] = useState(valor);
  const [modelo, setModelo] = useState<string | null>(null);
  const [data, setData] = useState(hoje());
  const [num, setNum] = useState('');
  const [livre, setLivre] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => setAtual(valor), [valor]);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) fecharTudo();
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && fecharTudo();
    document.addEventListener('mousedown', fechar);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fechar);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  function fecharTudo() {
    setAberto(false);
    setModelo(null);
    setLivre(null);
    setErro(null);
  }

  function salvar(texto: string) {
    const anterior = atual;
    setAtual(texto || null);
    fecharTudo();
    startTransition(async () => {
      const res = await salvarCampoDevolucao(chave, campo, texto);
      if (res.erro) {
        setAtual(anterior);
        setErro(res.erro);
        setAberto(true);
      }
    });
  }

  function escolher(opcao: string) {
    if (opcao.includes('{data}') || opcao.includes('{num}')) {
      setModelo(opcao);
      setNum('');
      setData(hoje());
    } else salvar(opcao);
  }

  const exibido = atual ?? sugestao ?? null;
  const verde = destaque && Boolean(atual);

  return (
    <div className="relative" ref={caixa}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        title={exibido ? `${exibido}\n(clique para alterar)` : `Preencher: ${titulo}`}
        className={`block w-full min-w-[120px] rounded px-1.5 py-1 text-left text-label leading-snug hover:ring-1 hover:ring-primary/40 ${
          verde ? 'bg-[#92D050]/40 text-on-surface' : atual ? 'text-on-surface' : 'text-on-surface-variant'
        } ${pending ? 'opacity-60' : ''}`}
      >
        {exibido ? (
          <span className={`line-clamp-3 ${!atual && sugestao ? 'italic' : ''}`}>{exibido}</span>
        ) : (
          <span className="text-outline">+ preencher</span>
        )}
      </button>

      {aberto && (
        <div className={`absolute top-full z-30 ${abrirParaEsquerda ? 'right-0' : 'left-0'} mt-1 w-72 rounded-md border border-border-muted bg-surface-container-lowest p-2 shadow-lg`}>
          <p className="mb-1 px-1 text-label font-medium text-on-surface-variant">{titulo}</p>

          {modelo ? (
            <div className="space-y-2 p-1">
              <p className="text-label text-on-surface">{preencherModelo(modelo, { data: modelo.includes('{data}') ? data : '', num: num || '…' })}</p>
              {modelo.includes('{num}') && (
                <input
                  autoFocus
                  value={num}
                  onChange={(e) => setNum(e.target.value)}
                  placeholder="Número"
                  className="h-8 w-full rounded border border-[#D1D5DB] px-2 text-body-sm"
                />
              )}
              {modelo.includes('{data}') && (
                <input
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  className="h-8 w-full rounded border border-[#D1D5DB] px-2 text-body-sm"
                />
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setModelo(null)} className="text-label text-on-surface-variant">
                  Voltar
                </button>
                <button
                  type="button"
                  disabled={modelo.includes('{num}') && !num.trim()}
                  onClick={() => salvar(preencherModelo(modelo, { data, num }))}
                  className="rounded bg-primary px-3 py-1 text-label font-medium text-on-primary disabled:opacity-40"
                >
                  Salvar
                </button>
              </div>
            </div>
          ) : livre !== null ? (
            <div className="space-y-2 p-1">
              <textarea
                autoFocus
                value={livre}
                onChange={(e) => setLivre(e.target.value)}
                rows={3}
                className="w-full rounded border border-[#D1D5DB] px-2 py-1 text-body-sm uppercase"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setLivre(null)} className="text-label text-on-surface-variant">
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={() => salvar(livre.toUpperCase())}
                  className="rounded bg-primary px-3 py-1 text-label font-medium text-on-primary"
                >
                  Salvar
                </button>
              </div>
            </div>
          ) : (
            <ul className="max-h-64 overflow-y-auto">
              {opcoes.map((o) => (
                <li key={o}>
                  <button
                    type="button"
                    onClick={() => escolher(o)}
                    className="w-full rounded px-2 py-1.5 text-left text-label text-on-surface hover:bg-primary-fixed"
                  >
                    {o.replace('{data}', '[data]').replace('{num}', '[nº]')}
                  </button>
                </li>
              ))}
              <li className="mt-1 border-t border-border-muted pt-1">
                <button
                  type="button"
                  onClick={() => setLivre(atual ?? '')}
                  className="w-full rounded px-2 py-1.5 text-left text-label font-medium text-primary hover:bg-primary-fixed"
                >
                  Outro (digitar)…
                </button>
              </li>
              {atual && (
                <li>
                  <button
                    type="button"
                    onClick={() => salvar('')}
                    className="w-full rounded px-2 py-1.5 text-left text-label text-error hover:bg-error-container/40"
                  >
                    Limpar
                  </button>
                </li>
              )}
            </ul>
          )}
          {erro && <p className="px-1 pt-1 text-label text-error">{erro}</p>}
        </div>
      )}
    </div>
  );
}
