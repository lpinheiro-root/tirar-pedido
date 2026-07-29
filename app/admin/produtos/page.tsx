import { requireRepresentante } from '@/lib/auth';
import { getTodosProdutos } from '@/lib/sqlserver';
import { createClient } from '@/lib/supabase/server';
import { PageHeading } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { ErrorNotice } from '@/components/ui/ErrorNotice';
import { ProdutoConfigRow } from './ProdutoConfigRow';
import type { Produto } from '@/types';

export default async function AdminProdutosPage() {
  await requireRepresentante('admin');

  let produtos: Produto[] = [];
  let erroConexao = false;
  try {
    produtos = await getTodosProdutos();
  } catch (err) {
    console.error('Falha ao conectar ao SQL Server:', err);
    erroConexao = true;
  }

  const supabase = createClient();
  const { data: configs } = await supabase
    .from('produtos_config')
    .select('produto_id_sql, ativo, preco_override');

  const configMap = new Map((configs ?? []).map((c) => [c.produto_id_sql, c]));

  return (
    <div>
      <PageHeading
        title="Painel de Produtos"
        subtitle="Gerencie a disponibilidade e o preço dos produtos exibidos no catálogo."
      />

      {erroConexao && (
        <div className="mb-4">
          <ErrorNotice
            title="Não foi possível conectar ao SQL Server de produtos"
            message="Verifique as variáveis SQLSERVER_HOST, SQLSERVER_USER, SQLSERVER_PASSWORD e SQLSERVER_DATABASE no .env.local."
          />
        </div>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-container-low">
              <tr className="text-label uppercase text-on-surface-variant">
                <th className="px-4 py-3 font-medium">Produto</th>
                <th className="px-4 py-3 font-medium">Categoria</th>
                <th className="px-4 py-3 font-medium">Preço B2B</th>
                <th className="px-4 py-3 font-medium">Estoque</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {produtos.map((produto) => {
                const config = configMap.get(produto.id);
                return (
                  <ProdutoConfigRow
                    key={produto.id}
                    produto={produto}
                    precoOverride={config?.preco_override ?? null}
                    ativoConfig={config ? config.ativo : produto.ativo}
                  />
                );
              })}
              {produtos.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-body-sm text-on-surface-variant">
                    Nenhum produto encontrado no catálogo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
