'use client';

import { useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { importarPlanilhaCartoes } from './actions';
import { FormMensagem } from './FormMensagem';

function Status() {
  const { pending } = useFormStatus();
  return pending ? <span className="text-label text-on-surface-variant">Importando…</span> : null;
}

/** Sobe a planilha "Cartões" do financeiro; o envio acontece ao escolher o arquivo. */
export function ImportarCartoesForm() {
  const [estado, formAction] = useFormState(importarPlanilhaCartoes, undefined);
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={formAction} className="flex flex-col items-end">
      <div className="flex items-center gap-2">
        <Status />
        <label
          title="A planilha Cartões do financeiro (ou um Excel baixado daqui e preenchido). O sistema aprende estabelecimento, descrição e conta contábil para preencher os próximos Excel."
          className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-primary px-3 text-body-sm font-medium text-primary hover:bg-primary/5"
        >
          Importar planilha Cartões
          <input
            type="file"
            name="arquivo"
            accept=".xlsx"
            className="hidden"
            onChange={() => form.current?.requestSubmit()}
          />
        </label>
      </div>
      <div className="max-w-xl text-right">
        <FormMensagem estado={estado} />
      </div>
    </form>
  );
}
