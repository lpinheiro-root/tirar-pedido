import Link from 'next/link';
import { requireRepresentante } from '@/lib/auth';
import { requireClienteSelecionado } from '@/lib/clienteSelecionado';
import { getProdutosPorGrupoComOverride } from '@/lib/produtos';
import { PageHeading } from '@/components/layout/Header';
import { CartSummaryBar } from '@/components/cart/CartSummaryBar';
import { ErrorNotice } from '@/components/ui/ErrorNotice';
import { IconChevronLeft } from '@/components/ui/Icons';
import { ProdutoCard } from './ProdutoCard';
import type { Produto } from '@/types';

export default async function ProdutosDoGrupoPage({ params }: { params: { grupoId: string } }) {
  await requireRepresentante('representante');
  const cliente = await requireClienteSelecionado();

  let produtos: Produto[] = [];
  let erroConexao = false;
  try {
    produtos = await getProdutosPorGrupoComOverride(params.grupoId, cliente.tabelaPreco);
  } catch (err) {
    console.error('Falha ao conectar ao SQL Server:', err);
    erroConexao = true;
  }
  const grupoNome = produtos[0]?.grupoNome ?? 'Produtos';

  return (
    <div>
      <Link
        href="/representante/produtos"
        className="mb-4 inline-flex items-center gap-1 text-body-sm text-on-surface-variant hover:text-primary"
      >
        <IconChevronLeft width={16} height={16} /> Voltar aos grupos
      </Link>

      <PageHeading title={grupoNome} subtitle={`${produtos.length} produtos disponíveis para ${cliente.nome}`} />

      {erroConexao && (
        <ErrorNotice
          title="Não foi possível conectar ao SQL Server de produtos"
          message="Verifique as variáveis SQLSERVER_HOST, SQLSERVER_USER, SQLSERVER_PASSWORD e SQLSERVER_DATABASE no .env.local."
        />
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {produtos.map((produto) => (
          <ProdutoCard key={produto.id} produto={produto} />
        ))}
        {produtos.length === 0 && !erroConexao && (
          <p className="col-span-full py-10 text-center text-body-sm text-on-surface-variant">
            Nenhum produto disponível neste grupo.
          </p>
        )}
      </div>

      <CartSummaryBar />
    </div>
  );
}
