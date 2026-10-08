'use client';

import { useFormStatus } from 'react-dom';
import { excluirFatura } from './actions';

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1 text-body-sm font-medium text-on-surface-variant hover:text-error disabled:opacity-50"
    >
      {pending ? 'Excluindo…' : 'Excluir'}
    </button>
  );
}

/** Exclui a fatura (e os lançamentos dela) depois de confirmar; dá para enviar o PDF de novo depois. */
export function ExcluirFaturaBotao({ faturaId, nome }: { faturaId: string; nome: string }) {
  return (
    <form
      action={excluirFatura}
      className="ml-4 inline"
      onSubmit={(e) => {
        if (!confirm(`Excluir a fatura "${nome}"? Os vínculos com as compras são desfeitos e você pode enviar o PDF de novo.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="faturaId" value={faturaId} />
      <Botao />
    </form>
  );
}
