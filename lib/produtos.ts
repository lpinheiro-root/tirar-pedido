import { getProdutosPorGrupo } from '@/lib/sqlserver';
import { createClient } from '@/lib/supabase/server';
import type { Produto } from '@/types';

/**
 * Produtos de um grupo, aplicando o override de admin (ativo/preço)
 * guardado em produtos_config no Supabase por cima dos dados do SQL Server.
 */
export async function getProdutosPorGrupoComOverride(
  grupoId: string,
  tabelaPreco?: string | null
): Promise<Produto[]> {
  const [produtos, supabase] = [await getProdutosPorGrupo(grupoId, tabelaPreco), createClient()];

  const { data: configs } = await supabase
    .from('produtos_config')
    .select('produto_id_sql, ativo, preco_override')
    .in(
      'produto_id_sql',
      produtos.map((p) => p.id)
    );

  const configMap = new Map((configs ?? []).map((c) => [c.produto_id_sql, c]));

  return produtos
    .map((produto) => {
      const config = configMap.get(produto.id);
      return {
        ...produto,
        ativo: config ? config.ativo : produto.ativo,
        preco: config?.preco_override ?? produto.preco,
      };
    })
    .filter((p) => p.ativo);
}
