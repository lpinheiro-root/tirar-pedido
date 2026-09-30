import { STATUS_LANCAMENTO, type StatusLancamento } from '@/lib/cartao/rotulos';

export function StatusLancamentoBadge({ status }: { status: StatusLancamento }) {
  const { label, classe } = STATUS_LANCAMENTO[status];
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-sm px-2 py-1 text-label font-medium ${classe}`}>
      {label}
    </span>
  );
}
