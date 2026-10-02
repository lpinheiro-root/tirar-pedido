'use client';

import { useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { importarExcelDevolucoes } from './actions';

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <span className="text-label text-on-surface-variant">{pending ? 'Importando…' : ''}</span>
  );
}

/** Sobe o Excel preenchido pela equipe; o envio acontece ao escolher o arquivo. */
export function ImportarExcelForm() {
  const [estado, formAction] = useFormState(importarExcelDevolucoes, undefined);
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={formAction} className="flex flex-col items-end">
      <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-primary px-3 text-body-sm font-medium text-on-primary hover:bg-primary/90">
        Importar Excel preenchido
        <input
          type="file"
          name="arquivo"
          accept=".xlsx"
          className="hidden"
          onChange={() => form.current?.requestSubmit()}
        />
      </label>
      <Enviar />
      {estado?.erro && <p className="mt-1 max-w-72 text-right text-label text-error">{estado.erro}</p>}
      {estado?.mensagem && <p className="mt-1 max-w-72 text-right text-label text-green-700">{estado.mensagem}</p>}
    </form>
  );
}
