import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { CLIENTE_COOKIE } from '@/lib/clienteCookie';
import { getClientePorId } from '@/lib/sqlserver';
import type { Cliente } from '@/types';

/**
 * Resolve o cliente selecionado (guardado em cookie pelo CartContext) no
 * servidor, para poder consultar a tabela de preço correta em TabelaPrecoSub.
 * Redireciona para a seleção de clientes se não houver nenhum escolhido.
 */
export async function requireClienteSelecionado(): Promise<Cliente> {
  const clienteId = cookies().get(CLIENTE_COOKIE)?.value;
  if (!clienteId) redirect('/representante/clientes');

  const cliente = await getClientePorId(clienteId);
  if (!cliente) redirect('/representante/clientes');

  return cliente;
}
