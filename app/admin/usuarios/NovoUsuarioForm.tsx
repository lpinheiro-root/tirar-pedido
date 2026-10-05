'use client';

import { useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { criarUsuario } from './actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Criando...' : 'Criar usuário'}
    </Button>
  );
}

export function NovoUsuarioForm() {
  const [estado, formAction] = useFormState(criarUsuario, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado?.sucesso) formRef.current?.reset();
  }, [estado]);

  return (
    <form ref={formRef} action={formAction}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-label text-on-surface-variant">Nome</label>
          <Input name="nome" required compact />
        </div>
        <div>
          <label className="mb-1 block text-label text-on-surface-variant">E-mail (login)</label>
          <Input name="email" type="email" autoComplete="off" required compact />
        </div>
        <div>
          <label className="mb-1 block text-label text-on-surface-variant">Senha (mín. 8 caracteres)</label>
          <Input name="senha" type="password" autoComplete="new-password" minLength={8} required compact />
        </div>
        <div>
          <label className="mb-1 block text-label text-on-surface-variant">Confirmar senha</label>
          <Input name="confirmacao" type="password" autoComplete="new-password" minLength={8} required compact />
        </div>
      </div>
      <div className="mt-4">
        <p className="mb-2 text-label text-on-surface-variant">Acesso</p>
        <div className="flex flex-wrap gap-6">
          <label className="inline-flex cursor-pointer items-center gap-2 text-body-sm text-on-surface">
            <input type="checkbox" name="acesso_cartao" defaultChecked className="h-4 w-4 accent-primary" />
            Cartão
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 text-body-sm text-on-surface">
            <input type="checkbox" name="acesso_devolucoes" className="h-4 w-4 accent-primary" />
            NF-e Recebidas
          </label>
        </div>
      </div>
      <div className="mt-4">
        <Enviar />
      </div>
      {estado?.erro && <p className="mt-2 text-body-sm text-error">{estado.erro}</p>}
      {estado?.sucesso && <p className="mt-2 text-body-sm text-green-700">{estado.sucesso}</p>}
    </form>
  );
}
