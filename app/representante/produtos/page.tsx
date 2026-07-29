import Link from 'next/link';
import { requireRepresentante } from '@/lib/auth';
import { requireClienteSelecionado } from '@/lib/clienteSelecionado';
import { getGruposDeProdutos } from '@/lib/sqlserver';
import { PageHeading } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { ErrorNotice } from '@/components/ui/ErrorNotice';
import { IconChevronRight } from '@/components/ui/Icons';
import type { GrupoProduto } from '@/types';

export default async function GruposDeProdutosPage() {
  await requireRepresentante('representante');
  const cliente = await requireClienteSelecionado();

  let grupos: GrupoProduto[] = [];
  let erroConexao = false;
  try {
    grupos = await getGruposDeProdutos(cliente.tabelaPreco);
  } catch (err) {
    console.error('Falha ao conectar ao SQL Server:', err);
    erroConexao = true;
  }

  return (
    <div>
      <PageHeading
        title="Grupos de Produtos"
        subtitle={`Catálogo de ${cliente.nome} — selecione uma categoria para ver os produtos disponíveis.`}
      />

      {erroConexao && (
        <ErrorNotice
          title="Não foi possível conectar ao SQL Server de produtos"
          message="Verifique as variáveis SQLSERVER_HOST, SQLSERVER_USER, SQLSERVER_PASSWORD e SQLSERVER_DATABASE no .env.local."
        />
      )}

      {!erroConexao && !cliente.tabelaPreco && (
        <ErrorNotice
          title="Cliente sem tabela de preço definida"
          message="Este cliente não tem uma tabela de preço configurada no ERP, então nenhum grupo com preço pôde ser encontrado."
        />
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {grupos.map((grupo) => (
          <Link key={grupo.id} href={`/representante/produtos/${grupo.id}`}>
            <Card className="group h-full overflow-hidden transition-shadow hover:shadow-md">
              <div className="aspect-square w-full bg-surface-container-low">
                {grupo.imagemUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={grupo.imagemUrl}
                    alt={grupo.nome}
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-body font-semibold text-on-surface">{grupo.nome}</p>
                  <p className="text-label text-on-surface-variant">
                    {grupo.totalProdutos} produtos disponíveis
                  </p>
                </div>
                <IconChevronRight
                  width={16}
                  height={16}
                  className="text-outline transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                />
              </div>
            </Card>
          </Link>
        ))}
        {grupos.length === 0 && !erroConexao && cliente.tabelaPreco && (
          <p className="col-span-full py-10 text-center text-body-sm text-on-surface-variant">
            Nenhum grupo de produtos disponível para este cliente.
          </p>
        )}
      </div>
    </div>
  );
}
