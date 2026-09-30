'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { importarCompras, novaCompra } from '../actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormMensagem } from '../FormMensagem';

const ORIGENS = [
  { value: 'shopee', label: 'Shopee' },
  { value: 'magalu', label: 'Magalu' },
  { value: 'amazon', label: 'Amazon' },
  { value: 'mercadolivre', label: 'Mercado Livre' },
  { value: 'outro', label: 'Outro site' },
];

const selectClasse =
  'h-9 w-full rounded-md border border-[#D1D5DB] bg-surface-container-lowest px-2 text-body-sm text-on-surface';

function Enviar({ texto, pendente }: { texto: string; pendente: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? pendente : texto}
    </Button>
  );
}

export function ImportarComprasForm() {
  const [estado, formAction] = useFormState(importarCompras, undefined);
  return (
    <form action={formAction}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label className="mb-1 block text-label text-on-surface-variant">Planilha (.xlsx ou .csv)</label>
          <input
            name="arquivo"
            type="file"
            accept=".xlsx,.xls,.csv"
            required
            className="block w-full text-body-sm text-on-surface file:mr-3 file:rounded-md file:border-0 file:bg-primary-fixed file:px-3 file:py-2 file:text-body-sm file:font-medium file:text-primary"
          />
        </div>
        <div className="w-40">
          <label className="mb-1 block text-label text-on-surface-variant">Site padrão</label>
          <select name="origem" className={selectClasse} defaultValue="shopee">
            {ORIGENS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <Enviar texto="Importar" pendente="Importando..." />
      </div>
      <p className="mt-2 text-label text-on-surface-variant">
        Colunas: <strong>Data</strong>, <strong>Valor</strong> (obrigatórias), Site, Loja, Descrição, Parcelas,
        Pedido. O número do pedido evita duplicar compras ao reimportar.
      </p>
      <FormMensagem estado={estado} />
    </form>
  );
}

export function NovaCompraForm() {
  const [estado, formAction] = useFormState(novaCompra, undefined);
  return (
    <form action={formAction}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <label className="mb-1 block text-label text-on-surface-variant">Site</label>
          <select name="origem" className={selectClasse} defaultValue="shopee">
            {ORIGENS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-label text-on-surface-variant">Data da compra</label>
          <Input name="data" type="date" required compact />
        </div>
        <div>
          <label className="mb-1 block text-label text-on-surface-variant">Valor total (R$)</label>
          <Input name="valor" inputMode="decimal" placeholder="0,00" required compact />
        </div>
        <div>
          <label className="mb-1 block text-label text-on-surface-variant">Parcelas</label>
          <Input name="parcelas" type="number" min={1} max={48} defaultValue={1} compact />
        </div>
        <div>
          <label className="mb-1 block text-label text-on-surface-variant">Loja / vendedor</label>
          <Input name="loja" compact />
        </div>
        <div>
          <label className="mb-1 block text-label text-on-surface-variant">Nº do pedido</label>
          <Input name="pedido" compact />
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-label text-on-surface-variant">Descrição</label>
          <Input name="descricao" placeholder="O que foi comprado" compact />
        </div>
      </div>
      <div className="mt-3">
        <Enviar texto="Cadastrar compra" pendente="Salvando..." />
      </div>
      <FormMensagem estado={estado} />
    </form>
  );
}
