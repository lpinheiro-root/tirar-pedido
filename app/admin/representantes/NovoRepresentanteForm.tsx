'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { criarRepresentante } from './actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { IconPlus } from '@/components/ui/Icons';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Criando...' : 'Criar Representante'}
    </Button>
  );
}

export function NovoRepresentanteForm() {
  const [aberto, setAberto] = useState(false);
  const [state, formAction] = useFormState(criarRepresentante, undefined);

  if (!aberto) {
    return (
      <Button size="sm" onClick={() => setAberto(true)}>
        <IconPlus width={16} height={16} /> Adicionar Novo
      </Button>
    );
  }

  return (
    <div className="mb-4 rounded-md border border-border-muted bg-surface-container-lowest p-5">
      {state?.sucesso ? (
        <div>
          <p className="text-body-sm font-medium text-on-surface">
            Representante criado com sucesso.
          </p>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Senha temporária: <span className="font-mono font-semibold">{state.senhaTemporaria}</span>{' '}
            — repasse ao representante e peça para trocar no primeiro acesso.
          </p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => setAberto(false)}>
            Fechar
          </Button>
        </div>
      ) : (
        <form action={formAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-label text-on-surface-variant">Nome</label>
            <Input name="nome" required compact />
          </div>
          <div>
            <label className="mb-1 block text-label text-on-surface-variant">Email</label>
            <Input name="email" type="email" required compact />
          </div>
          <div>
            <label className="mb-1 block text-label text-on-surface-variant">Telefone (WhatsApp)</label>
            <Input name="telefone" placeholder="5511999998888" compact />
          </div>
          <div>
            <label className="mb-1 block text-label text-on-surface-variant">Estado</label>
            <Input name="estado" placeholder="SP" maxLength={2} required compact />
          </div>
          <div>
            <label className="mb-1 block text-label text-on-surface-variant">
              Código do Representante (SQL)
            </label>
            <Input name="codigoRepresentanteSql" required compact />
          </div>
          <div>
            <label className="mb-1 block text-label text-on-surface-variant">Papel</label>
            <select
              name="role"
              defaultValue="representante"
              className="h-9 w-full rounded-md border border-[#D1D5DB] bg-surface-container-lowest px-3 text-body-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="representante">Representante</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {state?.erro && (
            <p className="col-span-full rounded-md bg-error-container px-3 py-2 text-body-sm text-error-on-container">
              {state.erro}
            </p>
          )}

          <div className="col-span-full flex gap-2">
            <SubmitButton />
            <Button type="button" variant="secondary" size="sm" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
