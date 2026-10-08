'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { enviarFatura } from './actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormMensagem } from './FormMensagem';

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="submit" disabled={pending}>
        {pending ? 'Lendo fatura...' : 'Enviar e conciliar'}
      </Button>
      {pending && (
        <span className="max-w-56 text-label text-on-surface-variant">
          Fatura salva como imagem leva 1 a 2 minutos para ler. Não feche a página.
        </span>
      )}
    </div>
  );
}

export function EnviarFaturaForm() {
  const [estado, formAction] = useFormState(enviarFatura, undefined);

  return (
    <form action={formAction}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <label className="mb-1 block text-label text-on-surface-variant">PDF da fatura</label>
          <input
            name="arquivo"
            type="file"
            accept="application/pdf,.pdf"
            required
            className="block w-full text-body-sm text-on-surface file:mr-3 file:rounded-md file:border-0 file:bg-primary-fixed file:px-3 file:py-2 file:text-body-sm file:font-medium file:text-primary"
          />
        </div>
        <div className="w-56">
          <label className="mb-1 block text-label text-on-surface-variant">
            Senha do PDF {estado?.precisaSenha ? '' : '(se houver)'}
          </label>
          <Input
            name="senha"
            type="password"
            placeholder="ex.: 5 primeiros dígitos do CPF"
            autoFocus={estado?.precisaSenha}
            compact
          />
        </div>
        <Enviar />
      </div>
      <FormMensagem estado={estado} />
    </form>
  );
}
