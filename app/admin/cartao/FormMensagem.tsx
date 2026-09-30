import type { FormResultado } from './actions';

export function FormMensagem({ estado }: { estado: FormResultado | undefined }) {
  if (estado?.erro) return <p className="mt-2 text-body-sm text-error">{estado.erro}</p>;
  if (estado?.mensagem) return <p className="mt-2 text-body-sm text-green-700">{estado.mensagem}</p>;
  return null;
}
