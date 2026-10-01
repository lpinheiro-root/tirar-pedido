'use client';

import { useState, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { buscarNotasAgora, salvarCertificado, type NotasFormState } from './actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
  'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
];

function Mensagem({ estado }: { estado: NotasFormState | undefined | null }) {
  if (estado?.erro) return <p className="mt-2 text-body-sm text-error">{estado.erro}</p>;
  if (estado?.mensagem) return <p className="mt-2 text-body-sm text-green-700">{estado.mensagem}</p>;
  return null;
}

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Validando...' : 'Salvar certificado'}
    </Button>
  );
}

export function CertificadoForm({ ufAtual }: { ufAtual: string | null }) {
  const [estado, formAction] = useFormState(salvarCertificado, undefined);
  return (
    <form action={formAction}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label className="mb-1 block text-label text-on-surface-variant">Certificado A1 (.pfx / .p12)</label>
          <input
            name="arquivo"
            type="file"
            accept=".pfx,.p12,application/x-pkcs12"
            required
            className="block w-full text-body-sm text-on-surface file:mr-3 file:rounded-md file:border-0 file:bg-primary-fixed file:px-3 file:py-2 file:text-body-sm file:font-medium file:text-primary"
          />
        </div>
        <div className="w-48">
          <label className="mb-1 block text-label text-on-surface-variant">Senha do certificado</label>
          <Input name="senha" type="password" autoComplete="off" required compact />
        </div>
        <div className="w-24">
          <label className="mb-1 block text-label text-on-surface-variant">UF da empresa</label>
          <select
            name="uf"
            defaultValue={ufAtual ?? ''}
            required
            className="h-9 w-full rounded-md border border-[#D1D5DB] bg-surface-container-lowest px-2 text-body-sm text-on-surface"
          >
            <option value="" disabled>
              UF
            </option>
            {UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </div>
        <Enviar />
      </div>
      <Mensagem estado={estado} />
    </form>
  );
}

export function BuscarAgoraButton() {
  const [pending, startTransition] = useTransition();
  const [estado, setEstado] = useState<NotasFormState | null>(null);
  return (
    <div>
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setEstado(null);
            setEstado(await buscarNotasAgora());
          })
        }
      >
        {pending ? 'Consultando a SEFAZ...' : 'Buscar agora'}
      </Button>
      <Mensagem estado={estado} />
    </div>
  );
}
