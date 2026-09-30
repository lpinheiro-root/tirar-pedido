'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { sincronizarMercadoLivre } from '../actions';
import { Button } from '@/components/ui/Button';
import { FormMensagem } from '../FormMensagem';

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Sincronizando...' : 'Sincronizar compras'}
    </Button>
  );
}

export function SincronizarForm() {
  const [estado, formAction] = useFormState(sincronizarMercadoLivre, undefined);
  return (
    <form action={formAction}>
      <div className="flex items-end gap-3">
        <div>
          <label className="mb-1 block text-label text-on-surface-variant">Período</label>
          <select
            name="dias"
            defaultValue="120"
            className="h-9 rounded-md border border-[#D1D5DB] bg-surface-container-lowest px-2 text-body-sm text-on-surface"
          >
            <option value="30">Últimos 30 dias</option>
            <option value="120">Últimos 4 meses</option>
            <option value="365">Últimos 12 meses (parcelados longos)</option>
          </select>
        </div>
        <Enviar />
      </div>
      <FormMensagem estado={estado} />
    </form>
  );
}
