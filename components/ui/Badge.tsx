import type { HTMLAttributes } from 'react';
import type { StatusPedido } from '@/types';

const statusStyles: Record<StatusPedido, string> = {
  enviado: 'bg-blue-100 text-blue-700',
  processando: 'bg-secondary-container/20 text-secondary',
  faturado: 'bg-green-100 text-green-700',
  cancelado: 'bg-error-container text-error-on-container',
};

const statusLabels: Record<StatusPedido, string> = {
  enviado: 'Enviado',
  processando: 'Processando',
  faturado: 'Faturado',
  cancelado: 'Cancelado',
};

export function StatusBadge({ status }: { status: StatusPedido }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm px-2 py-1 text-label font-medium ${statusStyles[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}

export function Badge({ className = '', ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={`inline-flex items-center rounded-sm bg-primary-fixed px-2 py-1 text-label font-medium text-primary ${className}`}
      {...props}
    />
  );
}
