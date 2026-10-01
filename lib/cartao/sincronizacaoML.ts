import { createServiceRoleClient } from '@/lib/supabase/server';
import { buscarCompras, type IntegracaoML } from './mercadolivre';

type ContaML = IntegracaoML & { usuario_id: string };

/**
 * Puxa as compras das contas do Mercado Livre e grava para o dono de cada conta.
 * Usada pelo botão "Sincronizar compras" e pela rotina agendada (todas as contas).
 */
export async function sincronizarContasML(
  contas: ContaML[],
  desde: string
): Promise<{ total: number; falhas: string[] }> {
  const service = createServiceRoleClient();
  let total = 0;
  const falhas: string[] = [];
  for (const conta of contas) {
    try {
      const compras = (await buscarCompras(conta, desde))
        .filter((c) => c.valor_total > 0 && c.data)
        .map((c) => ({ ...c, usuario_id: conta.usuario_id }));
      if (compras.length) {
        // service role: grava para o dono da conta (o super admin pode sincronizar a de outro usuário)
        const { error } = await service
          .from('cartao_compras')
          .upsert(compras, { onConflict: 'usuario_id,origem,pedido_externo' });
        if (error) throw new Error(error.message);
      }
      await service
        .from('cartao_integracoes')
        .update({ ultima_sincronizacao: new Date().toISOString() })
        .eq('id', conta.id);
      total += compras.length;
    } catch (e) {
      falhas.push(`${conta.apelido}: ${(e as Error).message}`);
    }
  }
  return { total, falhas };
}

/** Contas do Mercado Livre; sem `usuarioId`, todas (rotina agendada / super admin). */
export async function contasML(usuarioId?: string): Promise<ContaML[]> {
  let consulta = createServiceRoleClient().from('cartao_integracoes').select('*').eq('provedor', 'mercadolivre');
  if (usuarioId) consulta = consulta.eq('usuario_id', usuarioId);
  const { data } = await consulta;
  return (data ?? []) as ContaML[];
}
