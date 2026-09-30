'use client';

import { useState, useTransition } from 'react';
import { alternarAtivoRepresentante, redefinirSenhaRepresentante } from './actions';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import type { Representante } from '@/types';

export function RepresentanteRow({ representante }: { representante: Representante }) {
  const [pending, startTransition] = useTransition();
  const [redefinindo, setRedefinindo] = useState(false);
  const [formAberto, setFormAberto] = useState(false);
  const [senhaEscolhida, setSenhaEscolhida] = useState('');
  const [resultado, setResultado] = useState<{ senha?: string; erro?: string } | null>(null);

  async function handleRedefinirSenha() {
    setRedefinindo(true);
    setResultado(null);
    const res = await redefinirSenhaRepresentante(representante.id, senhaEscolhida);
    setResultado(res);
    setRedefinindo(false);
    if (res.senha) {
      setFormAberto(false);
      setSenhaEscolhida('');
    }
  }

  return (
    <>
      <tr className="border-t border-border-muted">
        <td className="px-4 py-3">
          <p className="text-body font-medium text-on-surface">{representante.nome}</p>
          <p className="text-label text-on-surface-variant">{representante.email}</p>
        </td>
        <td className="px-4 py-3 text-body-sm text-on-surface-variant">{representante.estado}</td>
        <td className="px-4 py-3 text-body-sm text-on-surface-variant">
          {representante.codigo_representante_sql}
        </td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex items-center rounded-sm px-2 py-1 text-label font-medium ${
              representante.role === 'admin' ? 'bg-primary-fixed text-primary' : 'bg-surface-container text-on-surface-variant'
            }`}
          >
            {representante.role === 'admin' ? 'Admin' : 'Representante'}
          </span>
        </td>
        <td className="px-4 py-3 text-body-sm text-on-surface-variant">
          {formatDate(representante.criado_em)}
        </td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex items-center rounded-sm px-2 py-1 text-label font-medium ${
              representante.ativo ? 'bg-green-100 text-green-700' : 'bg-error-container text-error-on-container'
            }`}
          >
            {representante.ativo ? 'Ativo' : 'Inativo'}
          </span>
        </td>
        <td className="px-4 py-3">
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFormAberto((aberto) => !aberto);
                setResultado(null);
              }}
            >
              Redefinir senha
            </Button>
            <Button
              variant={representante.ativo ? 'danger' : 'secondary'}
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(() => alternarAtivoRepresentante(representante.id, !representante.ativo))
              }
            >
              {representante.ativo ? 'Desativar' : 'Ativar'}
            </Button>
          </div>
        </td>
      </tr>
      {formAberto && (
        <tr className="border-t border-border-muted bg-surface-container-low/50">
          <td colSpan={7} className="px-4 py-3">
            <form
              className="flex flex-wrap items-center gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                handleRedefinirSenha();
              }}
            >
              <span className="text-body-sm text-on-surface">
                Nova senha para <span className="font-medium">{representante.nome}</span>:
              </span>
              <input
                type="text"
                value={senhaEscolhida}
                onChange={(e) => setSenhaEscolhida(e.target.value)}
                placeholder="Digite (mín. 8) ou deixe vazio para gerar"
                autoComplete="off"
                className="h-9 w-72 rounded-md border border-[#D1D5DB] bg-surface-container-lowest px-3 text-body-sm text-on-surface placeholder:text-outline focus:border-primary focus:outline-none"
              />
              <Button type="submit" size="sm" disabled={redefinindo}>
                {redefinindo ? 'Salvando...' : senhaEscolhida.trim() ? 'Definir senha' : 'Gerar senha'}
              </Button>
              <button
                type="button"
                onClick={() => setFormAberto(false)}
                className="text-label text-on-surface-variant hover:text-on-surface"
              >
                Cancelar
              </button>
            </form>
          </td>
        </tr>
      )}
      {resultado && (
        <tr className="border-t border-border-muted bg-surface-container-low/50">
          <td colSpan={7} className="px-4 py-3">
            {resultado.senha ? (
              <p className="text-body-sm text-on-surface">
                Nova senha para <span className="font-medium">{representante.nome}</span>:{' '}
                <span className="font-mono font-semibold text-primary">{resultado.senha}</span> — repasse ao
                representante e peça para trocar no próximo acesso.
              </p>
            ) : (
              <p className="text-body-sm text-error">{resultado.erro}</p>
            )}
            <button
              type="button"
              onClick={() => setResultado(null)}
              className="mt-1 text-label text-on-surface-variant hover:text-on-surface"
            >
              Fechar
            </button>
          </td>
        </tr>
      )}
    </>
  );
}
