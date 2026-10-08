import type { FormResultado } from './actions';

export function FormMensagem({ estado }: { estado: FormResultado | undefined }) {
  if (!estado?.erro && !estado?.mensagem) return null;
  return (
    <>
      {estado.mensagem && <p className="mt-2 text-body-sm text-green-700">{estado.mensagem}</p>}
      {estado.erro && <p className="mt-2 text-body-sm text-error">{estado.erro}</p>}
    </>
  );
}
