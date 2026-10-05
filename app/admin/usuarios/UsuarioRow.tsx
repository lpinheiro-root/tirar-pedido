'use client';

import { useState, useTransition } from 'react';
import { alternarAcesso, alternarAtivoUsuario, definirSenhaUsuario } from './actions';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/format';
import type { Representante } from '@/types';

export function UsuarioRow({ usuario, ehVoce }: { usuario: Representante; ehVoce: boolean }) {
  const [pending, startTransition] = useTransition();
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const [senha, setSenha] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ ok?: string; erro?: string } | null>(null);
  // sem a coluna acesso_cartao (SQL ainda não rodado) o Cartão vale como liberado
  const acesso = { cartao: usuario.acesso_cartao !== false, devolucoes: Boolean(usuario.acesso_devolucoes) };

  async function salvarSenha() {
    setSalvando(true);
    const res = await definirSenhaUsuario(usuario.id, senha);
    setSalvando(false);
    if (res.ok) {
      setTrocandoSenha(false);
      setSenha('');
      setMensagem({ ok: `Senha de ${usuario.nome} alterada.` });
    } else {
      setMensagem({ erro: res.erro });
    }
  }

  return (
    <>
      <tr className="border-t border-border-muted">
        <td className="px-4 py-3">
          <p className="text-body font-medium text-on-surface">
            {usuario.nome}
            {ehVoce && <span className="ml-2 text-label font-normal text-on-surface-variant">(você)</span>}
          </p>
        </td>
        <td className="px-4 py-3 text-body-sm text-on-surface-variant">{usuario.email}</td>
        <td className="px-4 py-3 text-body-sm text-on-surface-variant">{formatDate(usuario.criado_em)}</td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex items-center rounded-sm px-2 py-1 text-label font-medium ${
              usuario.ativo ? 'bg-green-100 text-green-700' : 'bg-error-container text-error-on-container'
            }`}
          >
            {usuario.ativo ? 'Ativo' : 'Inativo'}
          </span>
        </td>
        <td className="px-4 py-3">
          {usuario.super_admin ? (
            <span className="text-label text-on-surface-variant">tudo</span>
          ) : (
            <div className="flex flex-col gap-1">
              {(
                [
                  ['cartao', 'Cartão', acesso.cartao],
                  ['devolucoes', 'NF-e Recebidas', acesso.devolucoes],
                ] as const
              ).map(([tela, rotulo, marcado]) => (
                <label key={tela} className="inline-flex cursor-pointer items-center gap-2 text-body-sm text-on-surface">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={marcado}
                    disabled={pending}
                    onChange={(e) =>
                      startTransition(async () => {
                        const res = await alternarAcesso(usuario.id, tela, e.target.checked);
                        if (res.erro) setMensagem({ erro: res.erro });
                      })
                    }
                  />
                  {rotulo}
                </label>
              ))}
            </div>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setTrocandoSenha((v) => !v);
                setMensagem(null);
              }}
            >
              Trocar senha
            </Button>
            {!ehVoce && (
              <Button
                variant={usuario.ativo ? 'danger' : 'secondary'}
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await alternarAtivoUsuario(usuario.id, !usuario.ativo);
                    if (res.erro) setMensagem({ erro: res.erro });
                  })
                }
              >
                {usuario.ativo ? 'Desativar' : 'Ativar'}
              </Button>
            )}
          </div>
        </td>
      </tr>
      {(trocandoSenha || mensagem) && (
        <tr className="border-t border-border-muted bg-surface-container-low/50">
          <td colSpan={6} className="px-4 py-3">
            {trocandoSenha && (
              <form
                className="flex flex-wrap items-center gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  salvarSenha();
                }}
              >
                <span className="text-body-sm text-on-surface">
                  Nova senha para <span className="font-medium">{usuario.nome}</span>:
                </span>
                <input
                  type="text"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  minLength={8}
                  required
                  autoComplete="off"
                  className="h-9 w-64 rounded-md border border-[#D1D5DB] bg-surface-container-lowest px-3 text-body-sm text-on-surface placeholder:text-outline focus:border-primary focus:outline-none"
                />
                <Button type="submit" size="sm" disabled={salvando}>
                  {salvando ? 'Salvando...' : 'Salvar senha'}
                </Button>
                <button
                  type="button"
                  onClick={() => setTrocandoSenha(false)}
                  className="text-label text-on-surface-variant hover:text-on-surface"
                >
                  Cancelar
                </button>
              </form>
            )}
            {mensagem?.ok && <p className="text-body-sm text-green-700">{mensagem.ok}</p>}
            {mensagem?.erro && <p className="mt-1 text-body-sm text-error">{mensagem.erro}</p>}
          </td>
        </tr>
      )}
    </>
  );
}
